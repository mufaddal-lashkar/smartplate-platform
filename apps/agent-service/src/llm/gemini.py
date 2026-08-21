import json
import logging
from pathlib import Path

import httpx

from src.config import settings
from src.llm.provider import ProviderError
from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse
from src.validation.bounds import BoundsViolation, enforce_bounds

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v2"
PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "reuse_estimate"
CORRECTION_MARKER = "\n# Correction\n"
DATA_PLACEHOLDER = "{{DATA}}"
VIOLATION_PLACEHOLDER = "{{VIOLATION}}"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
REQUEST_TIMEOUT_SECONDS = 30.0

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "suggested_retain_qty": {"type": "number"},
        "suggested_sell_qty": {"type": "number"},
        "suggested_donate_qty": {"type": "number"},
        "suggested_price_per_unit": {"type": "number", "nullable": True},
        "reuse_route": {"type": "string", "nullable": True},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "basis": {"type": "string"},
    },
    "required": [
        "suggested_retain_qty",
        "suggested_sell_qty",
        "suggested_donate_qty",
        "suggested_price_per_unit",
        "reuse_route",
        "confidence",
        "basis",
    ],
    "propertyOrdering": [
        "suggested_retain_qty",
        "suggested_sell_qty",
        "suggested_donate_qty",
        "suggested_price_per_unit",
        "reuse_route",
        "confidence",
        "basis",
    ],
}


def _prompt_sections() -> tuple[str, str]:
    template = (PROMPT_DIR / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
    task, _, correction = template.partition(CORRECTION_MARKER)
    return task, correction


def _extract_json(payload: dict) -> dict:
    candidates = payload.get("candidates") or []
    if not candidates:
        raise ProviderError(f"gemini returned no candidates: {payload.get('promptFeedback')}")

    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise ProviderError(
            f"gemini returned an empty candidate: {candidates[0].get('finishReason')}"
        )

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderError(f"gemini returned unparseable json: {exc}") from exc


async def _generate(contents: list[dict]) -> ReuseEstimateResponse:
    url = f"{API_BASE}/{settings.gemini_model}:generateContent"
    body = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0,
            "topP": 1,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        try:
            response = await client.post(
                url, json=body, headers={"x-goog-api-key": settings.gemini_api_key}
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"gemini unreachable: {exc}") from exc

    if response.status_code != httpx.codes.OK:
        raise ProviderError(f"gemini returned {response.status_code}")

    fields = _extract_json(response.json())
    try:
        return ReuseEstimateResponse(
            prompt_version=PROMPT_VERSION,
            model=settings.gemini_model,
            source="model",
            **fields,
        )
    except (TypeError, ValueError) as exc:
        raise ProviderError(f"gemini response failed schema validation: {exc}") from exc


async def gemini_estimate(request: ReuseEstimateRequest) -> ReuseEstimateResponse:
    task, correction = _prompt_sections()
    contents = [
        {"role": "user", "parts": [{"text": task.replace(DATA_PLACEHOLDER, _payload(request))}]}
    ]

    result = await _generate(contents)
    violation = _violation(result, request)
    if not violation:
        return result

    logger.warning(
        "gemini reuse estimate violated bounds, retrying once with a correction",
        extra={"request_id": request.request_id, "violation": violation},
    )

    contents.append({"role": "model", "parts": [{"text": result.model_dump_json()}]})
    contents.append(
        {"role": "user", "parts": [{"text": correction.replace(VIOLATION_PLACEHOLDER, violation)}]}
    )

    corrected = await _generate(contents)
    retry_violation = _violation(corrected, request)
    if retry_violation:
        raise ProviderError(f"gemini violated bounds after a correction: {retry_violation}")

    return corrected


def _payload(request: ReuseEstimateRequest) -> str:
    return request.model_dump_json(indent=2)


def _violation(result: ReuseEstimateResponse, request: ReuseEstimateRequest) -> str:
    try:
        enforce_bounds(result, request)
    except BoundsViolation as exc:
        return exc.message
    return ""
