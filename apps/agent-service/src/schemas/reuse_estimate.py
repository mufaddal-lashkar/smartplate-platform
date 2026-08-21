from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

StorageMethod = Literal["room_temp", "refrigerated", "frozen"]
Channel = Literal["b2b", "ngo"]
Confidence = Literal["low", "medium", "high"]
Source = Literal["model", "deterministic"]


class LeftoverContext(BaseModel):
    dish_ref: str
    dish_name: str
    qty: float
    unit: str
    prepared_at: datetime
    safe_until: datetime
    storage: StorageMethod
    is_reusable: bool
    reuse_route: str | None = None


class ReuseHistoryPoint(BaseModel):
    service_date: date
    retained_qty: float
    actually_reused_qty: float


class ListingOutcome(BaseModel):
    price_per_unit: float
    channel: Channel
    sold: bool


class ReuseEstimateRequest(BaseModel):
    request_id: str
    leftover: LeftoverContext
    dish_reuse_history: list[ReuseHistoryPoint] = Field(default_factory=list)
    tomorrow_menu: list[str] = Field(default_factory=list)
    cost_basis_per_unit: float
    past_listing_outcomes: list[ListingOutcome] = Field(default_factory=list)


class ReuseEstimateResponse(BaseModel):
    prompt_version: str
    model: str
    source: Source
    suggested_retain_qty: float
    suggested_sell_qty: float
    suggested_donate_qty: float
    suggested_price_per_unit: float | None
    reuse_route: str | None
    confidence: Confidence
    basis: str
