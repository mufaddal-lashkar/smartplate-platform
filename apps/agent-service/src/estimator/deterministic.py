from datetime import UTC, datetime
from statistics import median

from src.schemas.reuse_estimate import Confidence, ReuseEstimateRequest, ReuseEstimateResponse

NGO_BUFFER_HOURS = 4.0
REUSE_MIN_HOURS = 12.0
DEFAULT_RETAIN_FRACTION = 0.4
SELL_FRACTION = 0.7
PRICE_MARKUP = 1.2
MODEL_NAME = "deterministic"
PROMPT_VERSION = "deterministic-v1"


def _plural(count: int, noun: str) -> str:
    if count == 1:
        return f"{count} {noun}"
    suffix = "es" if noun.endswith(("s", "sh", "ch", "x")) else "s"
    return f"{count} {noun}{suffix}"


def _normalise(name: str) -> str:
    return name.strip().casefold()


def _route_is_on_menu(route: str, menu: list[str]) -> bool:
    if not route.strip():
        return False
    return _normalise(route) in {_normalise(item) for item in menu}


def _hours_until(moment: datetime, now: datetime) -> float:
    anchored = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
    return (anchored - now).total_seconds() / 3600


def _retain(request: ReuseEstimateRequest, hours_left: float) -> tuple[float, str]:
    leftover = request.leftover
    route = leftover.reuse_route or ""

    if not leftover.is_reusable:
        return 0.0, "the dish is not marked reusable, so nothing is retained for tomorrow"

    if not route.strip():
        return 0.0, (f"no reuse route is recorded for {leftover.dish_name}, so nothing is retained")

    if hours_left < REUSE_MIN_HOURS:
        return 0.0, (
            f"{hours_left:.1f} hours of safe window remain, short of the "
            f"{REUSE_MIN_HOURS:.0f} hours needed to hold it for the next service, "
            "so nothing is retained"
        )

    note = (
        f"{route} is already on the coming menu"
        if _route_is_on_menu(route, request.tomorrow_menu)
        else f"{route} is the recorded conversion for {leftover.dish_name}"
    )

    reused = [point.actually_reused_qty for point in request.dish_reuse_history]
    if not reused:
        share = round(leftover.qty * DEFAULT_RETAIN_FRACTION, 3)
        return share, (
            f"no past reuse history for {leftover.dish_name}, so {DEFAULT_RETAIN_FRACTION:.0%} of "
            f"the {leftover.qty} {leftover.unit} is retained; {note}"
        )

    typical = round(float(median(reused)), 3)
    return min(leftover.qty, typical), (
        f"median reuse of {typical} {leftover.unit} across "
        f"{_plural(len(reused), 'past service')}; {note}"
    )


def _sell(remainder: float, hours_left: float) -> tuple[float, str]:
    if hours_left > NGO_BUFFER_HOURS:
        return round(remainder * SELL_FRACTION, 3), (
            f"{hours_left:.1f} hours of safe window remain against a {NGO_BUFFER_HOURS:.0f} hour "
            f"NGO buffer, so {SELL_FRACTION:.0%} of the remainder is offered for sale"
        )
    return 0.0, (
        f"only {hours_left:.1f} hours of safe window remain against a {NGO_BUFFER_HOURS:.0f} hour "
        "NGO buffer, so the whole remainder is offered for donation"
    )


def _price(request: ReuseEstimateRequest) -> tuple[float, str]:
    sold = [outcome.price_per_unit for outcome in request.past_listing_outcomes if outcome.sold]
    if sold:
        return round(float(median(sold)), 2), (
            f"price is the median of {_plural(len(sold), 'past listing')} that sold"
        )
    return round(request.cost_basis_per_unit * PRICE_MARKUP, 2), (
        f"price is a {PRICE_MARKUP - 1:.0%} margin on a cost basis of "
        f"{request.cost_basis_per_unit} per {request.leftover.unit}"
    )


def _confidence(history_points: int) -> Confidence:
    if history_points >= 5:
        return "high"
    if history_points >= 2:
        return "medium"
    return "low"


def deterministic_estimate(request: ReuseEstimateRequest) -> ReuseEstimateResponse:
    leftover = request.leftover
    hours_left = _hours_until(leftover.safe_until, datetime.now(UTC))

    retain, retain_basis = _retain(request, hours_left)
    remainder = leftover.qty - retain
    sell, sell_basis = _sell(remainder, hours_left)
    donate = remainder - sell
    price, price_basis = _price(request)

    return ReuseEstimateResponse(
        prompt_version=PROMPT_VERSION,
        model=MODEL_NAME,
        source="deterministic",
        suggested_retain_qty=retain,
        suggested_sell_qty=sell,
        suggested_donate_qty=donate,
        suggested_price_per_unit=price,
        reuse_route=leftover.reuse_route if retain > 0 else None,
        confidence=_confidence(len(request.dish_reuse_history)),
        basis=f"{retain_basis}; {sell_basis}; {price_basis}",
    )
