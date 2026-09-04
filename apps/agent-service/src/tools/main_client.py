import contextvars

import httpx

from src.config import settings

TOOL_TIMEOUT_SECONDS = 5.0

agent_tenant_id: contextvars.ContextVar[str] = contextvars.ContextVar("agent_tenant_id", default="")
agent_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("agent_user_id", default="")


class MainServiceError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"main-service {status}: {message}")
        self.status = status
        self.message = message


async def main_get(path: str) -> list[dict]:
    url = f"{settings.main_service_url.rstrip('/')}{path}"
    headers = {"x-service-token": settings.main_service_read_token}
    tenant_id = agent_tenant_id.get()
    user_id = agent_user_id.get()
    if tenant_id != "":
        headers["x-tenant-id"] = tenant_id
    if user_id != "":
        headers["x-user-id"] = user_id
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
