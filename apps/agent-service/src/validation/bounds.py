from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse

QUANTITY_TOLERANCE = 0.01
MIN_BASIS_LENGTH = 20


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
