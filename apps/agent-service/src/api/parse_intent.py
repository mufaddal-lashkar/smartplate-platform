import logging

from fastapi import APIRouter

from src.config import settings
from src.llm.parse_intent import gemini_parse_intent
from src.llm.parse_intent_fallback import deterministic_parse_intent
from src.llm.provider import ProviderError
from src.schemas.parse_intent import ParseIntentRequest, ParseIntentResponse
from src.validation.bounds import enforce_parse_intent_bounds

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["parse-intent"])


@router.post("/parse-intent", response_model=ParseIntentResponse)
async def parse_intent(request: ParseIntentRequest) -> ParseIntentResponse:
    if settings.gemini_api_key:
        try:
            result = await gemini_parse_intent(request)
        except ProviderError as exc:
            logger.warning(
                "falling back to deterministic parse_intent",
                extra={"request_id": request.request_id, "reason": str(exc)},
            )
            result = deterministic_parse_intent(request)
    else:
        result = deterministic_parse_intent(request)

    enforce_parse_intent_bounds(result, request.request_id)
    return result
