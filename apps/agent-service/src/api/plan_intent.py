import logging

from fastapi import APIRouter

from src.config import settings
from src.llm.plan_intent import gemini_plan_intent
from src.llm.plan_intent_fallback import deterministic_plan_intent
from src.llm.provider import ProviderError
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse
from src.validation.bounds import enforce_plan_bounds

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["plan-intent"])


@router.post("/plan-intent", response_model=PlanIntentResponse)
async def plan_intent(request: PlanIntentRequest) -> PlanIntentResponse:
    if settings.gemini_api_key:
        try:
            result = await gemini_plan_intent(request)
        except ProviderError as exc:
            logger.warning(
                "falling back to deterministic plan_intent",
                extra={"request_id": request.request_id, "reason": str(exc)},
            )
            result = deterministic_plan_intent(request)
    else:
        result = deterministic_plan_intent(request)

    enforce_plan_bounds(result, request.request_id)
    return result
