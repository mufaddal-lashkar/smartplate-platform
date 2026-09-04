from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def get_my_active_sessions() -> str:
    """List the active session families for the current user."""
    return await call_main("/v1/sessions")
