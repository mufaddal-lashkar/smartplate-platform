import httpx

from src.config import settings

TOOL_TIMEOUT_SECONDS = 5.0


class MainServiceError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"main-service {status}: {message}")
        self.status = status
        self.message = message


async def main_get(path: str) -> list[dict]:
    url = f"{settings.main_service_url.rstrip('/')}{path}"
    headers = {"x-service-token": settings.main_service_read_token}
    async with httpx.AsyncClient(timeout=TOOL_TIMEOUT_SECONDS) as client:
        try:
            response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise MainServiceError(0, f"unreachable: {exc}") from exc
    if response.status_code != httpx.codes.OK:
        raise MainServiceError(response.status_code, response.text[:200])
    body = response.json()
    if isinstance(body, dict) and isinstance(body.get("items"), list):
        return body["items"]
    if isinstance(body, list):
        return body
    return []
