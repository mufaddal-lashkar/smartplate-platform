from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.schemas.parse_intent import IntentName, RecentMessage, TenantType, UserRole


class PlanStep(BaseModel):
    intent: IntentName
    params: dict[str, str | float | int | bool] = Field(default_factory=dict)
    rationale: str
    requires_confirmation: bool = False


class PlanIntentRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    request_id: str
    text: str
    locale: str = "en-IN"
    context: list[RecentMessage] = Field(default_factory=list)
    user_role: UserRole
    tenant_type: TenantType
    today: str
    tenant_id: str = ""


class PlanIntentResponse(BaseModel):
    prompt_version: str
    model: str
    source: Literal["model", "deterministic"]
    plan: list[PlanStep] = Field(default_factory=list)
    confidence: float
    needs_clarification: list[str] = Field(default_factory=list)
    basis: str
    graph_path: Literal["graph", "flat_fallback", "deterministic"] | None = None
