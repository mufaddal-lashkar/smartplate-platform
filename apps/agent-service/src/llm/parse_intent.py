import json
import logging
from pathlib import Path

import httpx

from src.config import settings
from src.llm.provider import ProviderError
from src.schemas.parse_intent import ParseIntentRequest, ParseIntentResponse
from src.validation.bounds import BoundsViolation, enforce_parse_intent_bounds

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "parse_intent"
DATA_PLACEHOLDER = "{{DATA}}"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
REQUEST_TIMEOUT_SECONDS = 25.0

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": [
                "auth.me",
                "auth.logout",
                "sessions.list",
                "sessions.revoke",
                "inventory.stock",
                "inventory.expiring",
                "inventory.purchases.create",
                "inventory.adjustments.create",
                "prep.create",
                "prep.reuse_pending",
                "prep.reuse_confirm",
                "leftovers.list",
                "leftovers.record",
                "leftovers.disposition_suggest",
                "leftovers.dispositions",
                "listings.own",
                "listings.patch",
                "listings.cancel",
                "listings.complete",
                "listings.no_show",
                "market.browse",
                "market.mine",
                "market.claim",
                "market.release",
                "market.pickups",
                "analytics.dashboard",
                "analytics.waste",
                "analytics.recovery",
                "analytics.dishes",
                "analytics.forecasts",
                "insights.get",
                "reports.create",
                "reports.list",
                "reports.download",
                "tenant.get",
                "tenant.update",
                "restaurant.get",
                "restaurant.update",
                "ngo.get",
                "ngo.update",
                "ngo.verification.submit",
                "users.list",
                "users.invite",
                "users.update",
                "users.archive",
                "permissions.list",
                "permissions.set",
                "permissions.clear",
                "admin.tenants.list",
                "admin.verification.queue",
                "admin.verification.decide",
                "admin.analytics",
                "catalog.dishes.list",
                "catalog.dishes.create",
                "catalog.ingredients.list",
                "catalog.ingredients.create",
                "catalog.suppliers.list",
                "catalog.suppliers.create",
                "catalog.recipe.get",
                "catalog.recipe.put",
                "notifications.preferences.get",
                "notifications.preferences.set",
                "help",
                "menu",
                "unknown",
            ],
        },
        "confidence": {"type": "number"},
        "entities": {"type": "object"},
        "needs_clarification": {"type": "array", "items": {"type": "string"}},
        "basis": {"type": "string"},
    },
    "required": ["intent", "confidence", "entities", "needs_clarification", "basis"],
    "propertyOrdering": ["intent", "confidence", "entities", "needs_clarification", "basis"],
}


def _prompt_text() -> str:
    return (PROMPT_DIR / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")


def _payload(request: ParseIntentRequest) -> str:
    return request.model_dump_json(indent=2)


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


async def _generate(contents: list[dict]) -> ParseIntentResponse:
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
        return ParseIntentResponse(
            prompt_version=PROMPT_VERSION,
            model=settings.gemini_model,
            source="model",
            **fields,
        )
    except (TypeError, ValueError) as exc:
        raise ProviderError(f"gemini response failed schema validation: {exc}") from exc


async def gemini_parse_intent(request: ParseIntentRequest) -> ParseIntentResponse:
    prompt = _prompt_text()
    contents = [
        {"role": "user", "parts": [{"text": prompt.replace(DATA_PLACEHOLDER, _payload(request))}]}
    ]

    result = await _generate(contents)
    try:
        enforce_parse_intent_bounds(result, request.request_id)
    except BoundsViolation as exc:
        logger.warning(
            "gemini parse_intent violated bounds, retrying once",
            extra={"request_id": request.request_id, "violation": exc.message},
        )
        correction = (
            "Your previous response violated this bound: "
            f"{exc.message}. Return a corrected response that respects the bound."
        )
        contents.append({"role": "model", "parts": [{"text": result.model_dump_json()}]})
        contents.append({"role": "user", "parts": [{"text": correction}]})
        corrected = await _generate(contents)
        enforce_parse_intent_bounds(corrected, request.request_id)
        return corrected
    return result
