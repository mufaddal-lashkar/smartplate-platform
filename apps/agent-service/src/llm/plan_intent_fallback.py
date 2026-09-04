from src.config import settings
from src.llm.parse_intent_fallback import deterministic_parse_intent
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse, PlanStep

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


def _coerce_params(values: dict) -> dict[str, str | float | int | bool]:
    import json

    coerced: dict[str, str | float | int | bool] = {}
    for key, value in values.items():
        if isinstance(value, (bool, int, float, str)):
            coerced[key] = value
        elif isinstance(value, (list, dict)):
            coerced[key] = json.dumps(value)
        else:
            coerced[key] = str(value)
    return coerced


def deterministic_plan_intent(request: PlanIntentRequest) -> PlanIntentResponse:
    parse_response = deterministic_parse_intent(
        _to_parse_request(request).model_copy(update={"request_id": request.request_id})
    )
    intent = parse_response.intent
    params = _coerce_params(parse_response.entities)
    requires_confirmation = intent in DESTRUCTIVE_INTENTS
    rationale = (
        f"deterministic single-step plan for {intent} based on keyword match against "
        f"{len(request.text)} chars of free text"
    )
    if intent == "unknown":
        plan: list[PlanStep] = []
        needs = ["intent"]
        confidence = 0.3
    else:
        plan = [
            PlanStep(
                intent=intent,  # type: ignore[arg-type]
                params=params,
                rationale=rationale,
                requires_confirmation=requires_confirmation,
            )
        ]
        needs = parse_response.needs_clarification
        confidence = parse_response.confidence
    return PlanIntentResponse(
        prompt_version="v1-fallback",
        model=settings.gemini_model,
        source="deterministic",
        plan=plan,
        confidence=confidence,
        needs_clarification=needs,
        basis=parse_response.basis,
    )


def _to_parse_request(request: PlanIntentRequest):  # type: ignore[no-untyped-def]
    from src.schemas.parse_intent import ParseIntentRequest

    return ParseIntentRequest(
        request_id=request.request_id,
        text=request.text,
        locale=request.locale,
        context=request.context,
        user_role=request.user_role,
        tenant_type=request.tenant_type,
    )


__all__ = ["DESTRUCTIVE_INTENTS", "deterministic_plan_intent"]
