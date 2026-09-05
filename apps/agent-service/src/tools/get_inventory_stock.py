from langchain_core.tools import tool

from src.tools._shared import call_main


@tool
async def get_inventory_stock() -> str:
    """Aggregate stock by ingredient for the tenant. Returns up to 25 items."""
    return await call_main("/v1/inventory/stock")
