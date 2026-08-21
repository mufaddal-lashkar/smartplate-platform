import logging

from fastapi import APIRouter

from src.config import settings
from src.estimator.deterministic import deterministic_estimate
from src.llm.gemini import gemini_estimate
from src.llm.provider import ProviderError, ReuseProvider
from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse
from src.validation.bounds import enforce_bounds

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["reuse-estimate"])

provider: ReuseProvider = gemini_estimate


@router.post("/reuse-estimate", response_model=ReuseEstimateResponse)
async def reuse_estimate(request: ReuseEstimateRequest) -> ReuseEstimateResponse:
    if settings.gemini_api_key:
        try:
            result = await provider(request)
            result.source = "model"
        except ProviderError as exc:
            logger.warning(
                "falling back to the deterministic estimator",
                extra={"request_id": request.request_id, "reason": str(exc)},
            )
            result = deterministic_estimate(request)
            result.source = "deterministic"
    else:
        result = deterministic_estimate(request)
        result.source = "deterministic"

    enforce_bounds(result, request)
    return result
