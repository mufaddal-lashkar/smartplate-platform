from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.api.parse_intent import router as parse_intent_router
from src.api.plan_intent import router as plan_intent_router
from src.api.reuse_estimate import router as reuse_estimate_router
from src.config import settings
from src.validation.bounds import BoundsViolation

app = FastAPI(
    title="SmartPlate agent-service",
    version="0.1.0",
    description=(
        "Stateless AI compute. No database, no Redis, no disk state, no published port. "
        "Receives pushed feature payloads and returns structured insight. "
        "Calls Gemini and nothing else."
    ),
)

app.include_router(reuse_estimate_router)
app.include_router(parse_intent_router)
app.include_router(plan_intent_router)


@app.exception_handler(BoundsViolation)
async def bounds_violation_handler(_: Request, exc: BoundsViolation) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "code": "BOUNDS_VIOLATION",
            "message": exc.message,
            "request_id": exc.request_id,
        },
    )


@app.get("/health")
def health() -> dict:
    return {
        "service": "agent-service",
        "status": "ok",
        "gemini_configured": bool(settings.gemini_api_key),
        "model": settings.gemini_model,
    }
