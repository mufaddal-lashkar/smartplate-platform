from langchain_core.tools import BaseTool

from src.tools.get_inventory_stock import get_inventory_stock
from src.tools.get_my_active_sessions import get_my_active_sessions
from src.tools.list_my_listings import list_my_listings
from src.tools.list_my_pending_leftovers import list_my_pending_leftovers
from src.tools.search_dishes import search_dishes
from src.tools.search_ingredients import search_ingredients


def all_tools() -> list[BaseTool]:
    return [
        search_dishes,
        search_ingredients,
        list_my_pending_leftovers,
        list_my_listings,
        get_my_active_sessions,
        get_inventory_stock,
    ]
