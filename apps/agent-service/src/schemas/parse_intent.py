from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

UserRole = Literal["super_admin", "owner", "staff", "ngo_admin", "ngo_volunteer"]
TenantType = Literal["restaurant", "ngo"]

IntentName = Literal[
    "auth.me",
    "auth.logout",
    "sessions.list",
    "sessions.revoke",
    "inventory.stock",
    "inventory.expiring",
    "inventory.purchases.create",
    "inventory.adjustments.create",
    "prep.create",
    "prep.reuse_pending",
    "prep.reuse_confirm",
    "leftovers.list",
    "leftovers.record",
    "leftovers.disposition_suggest",
    "leftovers.dispositions",
    "listings.own",
    "listings.patch",
    "listings.cancel",
    "listings.complete",
    "listings.no_show",
    "market.browse",
    "market.mine",
    "market.claim",
    "market.release",
    "market.pickups",
    "analytics.dashboard",
    "analytics.waste",
    "analytics.recovery",
    "analytics.dishes",
    "analytics.forecasts",
    "insights.get",
    "reports.create",
    "reports.list",
    "reports.download",
    "tenant.get",
    "tenant.update",
    "restaurant.get",
    "restaurant.update",
    "ngo.get",
    "ngo.update",
    "ngo.verification.submit",
    "users.list",
    "users.invite",
    "users.update",
    "users.archive",
    "permissions.list",
    "permissions.set",
    "permissions.clear",
    "admin.tenants.list",
    "admin.verification.queue",
    "admin.verification.decide",
    "admin.analytics",
    "catalog.dishes.list",
    "catalog.dishes.create",
    "catalog.ingredients.list",
    "catalog.ingredients.create",
    "catalog.suppliers.list",
    "catalog.suppliers.create",
    "catalog.recipe.get",
    "catalog.recipe.put",
    "notifications.preferences.get",
    "notifications.preferences.set",
    "help",
    "menu",
    "unknown",
]


class RecentMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class ParseIntentRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    request_id: str
    text: str
    locale: str = "en-IN"
    context: list[RecentMessage] = Field(default_factory=list)
    user_role: UserRole
    tenant_type: TenantType


class ParseIntentResponse(BaseModel):
    prompt_version: str
    model: str
    source: Literal["model", "deterministic"]
    intent: IntentName
    confidence: float
    entities: dict[str, str | float | int | bool | list[str]] = Field(default_factory=dict)
    needs_clarification: list[str] = Field(default_factory=list)
    basis: str
