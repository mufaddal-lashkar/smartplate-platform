import logging

from src.config import settings
from src.llm.gemini_provider import GeminiProvider
from src.llm.graph import run_graph
from src.llm.plan_intent import gemini_plan_intent
from src.llm.plan_intent_fallback import deterministic_plan_intent
from src.llm.provider import LLMProvider, ProviderError
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse
from src.tools.registry import all_tools

logger = logging.getLogger(__name__)


def _build_provider() -> LLMProvider:
    return GeminiProvider()


def _patch_graph_path(response: PlanIntentResponse, path: str) -> PlanIntentResponse:
    return response.model_copy(update={"graph_path": path})


async def run_plan_intent_graph(request: PlanIntentRequest) -> PlanIntentResponse:
    if not settings.plan_intent_graph_enabled or not settings.gemini_api_key:
        if settings.gemini_api_key:
            flat = await _flat_gemini(request)
            if flat is not None:
                return _patch_graph_path(flat, "flat_fallback")
        return _patch_graph_path(deterministic_plan_intent(request), "deterministic")

    provider = _build_provider()
    tools = all_tools()
    try:
        graph_result = await run_graph(
            provider,
            tools,
            request,
            max_tool_calls=settings.plan_intent_max_tool_calls,
            timeout_seconds=settings.plan_intent_timeout_seconds,
        )
    except ProviderError as exc:
        logger.warning(
            "graph failed, falling back to flat",
            extra={"request_id": request.request_id, "error": str(exc)},
        )
        graph_result = None

    if graph_result is not None:
        return _patch_graph_path(graph_result, "graph")

    flat = await _flat_gemini(request)
    if flat is not None:
        return _patch_graph_path(flat, "flat_fallback")
    return _patch_graph_path(deterministic_plan_intent(request), "deterministic")


async def _flat_gemini(request: PlanIntentRequest) -> PlanIntentResponse | None:
    try:
        return await gemini_plan_intent(request)
    except ProviderError as exc:
        logger.warning(
            "flat gemini_plan_intent failed",
            extra={"request_id": request.request_id, "error": str(exc)},
        )
        return None
