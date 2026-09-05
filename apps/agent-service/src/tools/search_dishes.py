from typing import Annotated

from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def search_dishes(query: Annotated[str, "free-text search for the dish name"]) -> str:
    """Search the tenant's active dishes by name. Returns up to 25 matches."""
    q = query.strip()
    path = "/v1/dishes" if q == "" else f"/v1/dishes?search={q}"
    return await call_main(path)
