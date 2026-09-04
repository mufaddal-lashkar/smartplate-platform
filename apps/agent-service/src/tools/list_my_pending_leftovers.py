from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def list_my_pending_leftovers() -> str:
    """List today's leftovers pending a recovery decision. Returns up to 25 items."""
    return await call_main("/v1/leftovers?serviceDate=today")
