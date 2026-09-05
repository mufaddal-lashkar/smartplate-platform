from typing import Annotated

from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def search_ingredients(
    query: Annotated[str, "free-text search for the ingredient name"],
) -> str:
    """Search the tenant's active ingredients by name. Returns up to 25 matches."""
    q = query.strip()
    path = "/v1/ingredients" if q == "" else f"/v1/ingredients?search={q}"
    return await call_main(path)
