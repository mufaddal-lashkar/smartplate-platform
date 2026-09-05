import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

from src.tools import _shared, main_client
from src.tools.registry import all_tools


def test_registry_returns_six_tools() -> None:
    tools = all_tools()
    names = sorted(t.name for t in tools)
    assert names == sorted(
        {
            "search_dishes",
            "search_ingredients",
            "list_my_pending_leftovers",
            "list_my_listings",
            "get_my_active_sessions",
            "get_inventory_stock",
        }
    )


@asynccontextmanager
async def _patched_client(handler) -> AsyncIterator[None]:
    transport = httpx.MockTransport(handler)
    original = main_client.httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return original(*args, **kwargs)

    main_client.httpx.AsyncClient = factory
    try:
        yield
    finally:
        main_client.httpx.AsyncClient = original


def test_main_client_sends_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-service-token") == "dev-read-token"
        return httpx.Response(200, json={"items": [{"id": "D1", "name": "Biryani"}]})

    async def run() -> list[dict]:
        async with _patched_client(handler):
            return await main_client.main_get("/v1/dishes?search=bir")

    items = asyncio.new_event_loop().run_until_complete(run())
    assert items == [{"id": "D1", "name": "Biryani"}]


def test_main_client_unreachable_returns_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope")

    async def run() -> str:
        async with _patched_client(handler):
            return await _shared.call_main("/v1/dishes")

    body = json.loads(asyncio.new_event_loop().run_until_complete(run()))
    assert body["error"] is True
    assert body["status"] == 0


def test_main_client_non_ok_returns_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="forbidden")

    async def run() -> str:
        async with _patched_client(handler):
            return await _shared.call_main("/v1/dishes")

    body = json.loads(asyncio.new_event_loop().run_until_complete(run()))
    assert body["error"] is True
    assert body["status"] == 403


def test_main_client_sends_tenant_and_user_when_set() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["x-service-token"] = request.headers.get("x-service-token", "")
        captured["x-tenant-id"] = request.headers.get("x-tenant-id", "")
        captured["x-user-id"] = request.headers.get("x-user-id", "")
        return httpx.Response(200, json={"items": []})

    async def run() -> None:
        token_t = main_client.agent_tenant_id.set("tenant-X")
        token_u = main_client.agent_user_id.set("user-Y")
        try:
            async with _patched_client(handler):
                await main_client.main_get("/v1/dishes")
        finally:
            main_client.agent_tenant_id.reset(token_t)
            main_client.agent_user_id.reset(token_u)

    asyncio.new_event_loop().run_until_complete(run())
    assert captured == {
        "x-service-token": "dev-read-token",
        "x-tenant-id": "tenant-X",
        "x-user-id": "user-Y",
    }


def test_main_client_omits_headers_when_context_unset() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["x-tenant-id"] = request.headers.get("x-tenant-id", "<missing>")
        captured["x-user-id"] = request.headers.get("x-user-id", "<missing>")
        return httpx.Response(200, json={"items": []})

    async def run() -> None:
        async with _patched_client(handler):
            await main_client.main_get("/v1/dishes")

    asyncio.new_event_loop().run_until_complete(run())
    assert captured == {"x-tenant-id": "<missing>", "x-user-id": "<missing>"}
