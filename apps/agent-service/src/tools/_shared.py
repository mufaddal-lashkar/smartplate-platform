import json

from src.tools.main_client import MainServiceError, main_get


async def call_main(path: str) -> str:
    try:
        items = await main_get(path)
    except MainServiceError as exc:
        return json.dumps({"error": True, "status": exc.status, "message": exc.message})
    return json.dumps({"count": len(items), "items": items[:25]})
