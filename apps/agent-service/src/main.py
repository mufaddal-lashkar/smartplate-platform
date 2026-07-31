from fastapi import FastAPI

from src.config import settings

app = FastAPI(
    title="SmartPlate agent-service",
    version="0.1.0",
    description=(
        "Stateless AI compute. No database, no Redis, no disk state, no published port. "
        "Receives pushed feature payloads and returns structured insight. "
        "Calls Gemini and nothing else."
    ),
)


@app.get("/health")
def health() -> dict:
    return {
        "service": "agent-service",
        "status": "ok",
        "gemini_configured": bool(settings.gemini_api_key),
        "model": settings.gemini_model,
    }
