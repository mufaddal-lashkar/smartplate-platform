from src.schemas.parse_intent import ParseIntentResponse
from src.schemas.plan_intent import PlanIntentResponse
from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse

QUANTITY_TOLERANCE = 0.01
MIN_BASIS_LENGTH = 20
MIN_CONFIDENCE = 0.0
MAX_CONFIDENCE = 1.0
MIN_INTENT_BASIS = 20

MIN_PLAN_LENGTH = 1
MAX_PLAN_LENGTH = 6
MIN_RATIONALE_LENGTH = 20
MIN_PLAN_CONFIDENCE = 0.0
MAX_PLAN_CONFIDENCE = 1.0
DESTRUCTIVE_INTENTS = frozenset(
    {
        "leftovers.dispositions",
        "listings.cancel",
        "listings.no_show",
        "sessions.revoke",
        "users.archive",
        "auth.logout",
        "market.release",
        "admin.verification.decide",
    }
)
DENIED_PARAM_KEYS = frozenset({"safeUntil", "safe_until", "expiresAt", "expires_at"})


class BoundsViolation(Exception):
    def __init__(self, request_id: str, message: str) -> None:
        super().__init__(message)
        self.request_id = request_id
        self.message = message


def enforce_bounds(result: ReuseEstimateResponse, request: ReuseEstimateRequest) -> None:
    request_id = request.request_id
    quantities = {
        "suggested_retain_qty": result.suggested_retain_qty,
        "suggested_sell_qty": result.suggested_sell_qty,
        "suggested_donate_qty": result.suggested_donate_qty,
    }

    for name, value in quantities.items():
        if value < 0:
            raise BoundsViolation(request_id, f"{name} must not be negative, got {value}")

    total = sum(quantities.values())
    if abs(total - request.leftover.qty) > QUANTITY_TOLERANCE:
        raise BoundsViolation(
            request_id,
            f"retain + sell + donate must equal leftover.qty {request.leftover.qty}, got {total}",
        )

    if len(result.basis) < MIN_BASIS_LENGTH:
        raise BoundsViolation(
            request_id,
            f"basis must be at least {MIN_BASIS_LENGTH} characters, got {len(result.basis)}",
        )

    price = result.suggested_price_per_unit
    if result.suggested_sell_qty > 0 and (price is None or price <= 0):
        raise BoundsViolation(
            request_id,
            f"suggested_price_per_unit must be positive when selling, got {price}",
        )


def enforce_parse_intent_bounds(result: ParseIntentResponse, request_id: str) -> None:
    if not (MIN_CONFIDENCE <= result.confidence <= MAX_CONFIDENCE):
        raise BoundsViolation(
            request_id,
            f"confidence must be in [{MIN_CONFIDENCE}, {MAX_CONFIDENCE}], got {result.confidence}",
        )
    if len(result.basis) < MIN_INTENT_BASIS:
        raise BoundsViolation(
            request_id,
            f"basis must be at least {MIN_INTENT_BASIS} characters, got {len(result.basis)}",
        )


def enforce_plan_bounds(result: PlanIntentResponse, request_id: str) -> None:
    if not (MIN_PLAN_CONFIDENCE <= result.confidence <= MAX_PLAN_CONFIDENCE):
        raise BoundsViolation(
            request_id,
            f"confidence must be in [{MIN_PLAN_CONFIDENCE}, {MAX_PLAN_CONFIDENCE}], "
            f"got {result.confidence}",
        )
    if len(result.basis) < MIN_INTENT_BASIS:
        raise BoundsViolation(
            request_id,
            f"basis must be at least {MIN_INTENT_BASIS} characters, got {len(result.basis)}",
        )
    if not (MIN_PLAN_LENGTH <= len(result.plan) <= MAX_PLAN_LENGTH):
        raise BoundsViolation(
            request_id,
            f"plan length must be in [{MIN_PLAN_LENGTH}, {MAX_PLAN_LENGTH}], "
            f"got {len(result.plan)}",
        )
    confirms = sum(1 for step in result.plan if step.requires_confirmation)
    if confirms > 1:
        raise BoundsViolation(
            request_id,
            f"at most one step may have requires_confirmation, got {confirms}",
        )
    for index, step in enumerate(result.plan):
        if step.intent == "unknown":
            raise BoundsViolation(request_id, f"step {index} intent must not be 'unknown'")
        if len(step.rationale) < MIN_RATIONALE_LENGTH:
            raise BoundsViolation(
                request_id,
                f"step {index} rationale must be at least {MIN_RATIONALE_LENGTH} chars, "
                f"got {len(step.rationale)}",
            )
        for key in step.params:
            if key in DENIED_PARAM_KEYS:
                raise BoundsViolation(
                    request_id,
                    f"step {index} uses denied param key '{key}' (R36 enforcement)",
                )
    if (
        result.plan
        and result.plan[0].intent in DESTRUCTIVE_INTENTS
        and not result.plan[0].requires_confirmation
    ):
        raise BoundsViolation(
            request_id,
            f"first step '{result.plan[0].intent}' is destructive and must "
            f"have requires_confirmation=true",
        )
    if result.needs_clarification and result.plan:
        raise BoundsViolation(
            request_id,
            "needs_clarification must be empty when a plan is returned",
        )
