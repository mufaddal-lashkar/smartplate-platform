from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def list_my_listings() -> str:
    """List the tenant's own surplus listings (open, cancelled, completed). Returns up to 25 items."""
    return await call_main("/v1/listings")
