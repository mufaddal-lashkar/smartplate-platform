import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse, PlanStep
from src.validation.bounds import BoundsViolation, enforce_plan_bounds

client = TestClient(app)


def _request(
    text: str = "give me last 3 days of report",
    role: str = "owner",
    tenant: str = "restaurant",
    today: str = "2026-09-03",
) -> PlanIntentRequest:
    return PlanIntentRequest(
        request_id="test-1",
        text=text,
        user_role=role,
        tenant_type=tenant,
        today=today,
    )


def _response(plan: list[PlanStep], **overrides) -> PlanIntentResponse:
    defaults = {
        "prompt_version": "v1",
        "model": "gemini-2.5-flash",
        "source": "model",
        "plan": plan,
        "confidence": 0.8,
        "needs_clarification": [],
        "basis": "test plan with at least twenty characters of rationale",
    }
    defaults.update(overrides)
    return PlanIntentResponse(**defaults)


def test_single_step_report_plan_passes_bounds() -> None:
    plan = [
        PlanStep(
            intent="reports.create",
            params={"period": "last-3-days", "format": "pdf"},
            rationale="build a pdf report covering the last three days",
        )
    ]
    enforce_plan_bounds(_response(plan), "test-1")


def test_multi_step_leftover_plan_passes_bounds() -> None:
    plan = [
        PlanStep(
            intent="leftovers.record",
            params={"dish": "biryani", "qty": 20, "unit": "plate"},
            rationale="log twenty plates of biryani as a leftover",
        ),
        PlanStep(
            intent="leftovers.dispositions",
            params={"dispositions": "[]"},
            rationale="commit the disposition split suggested by the assistant",
            requires_confirmation=True,
        ),
    ]
    enforce_plan_bounds(_response(plan), "test-1")


def test_seven_step_plan_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="inventory.stock",
            params={},
            rationale=f"read current stock level at step {i}",
        )
        for i in range(7)
    ]
    with pytest.raises(BoundsViolation, match="plan length"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_empty_plan_is_rejected() -> None:
    with pytest.raises(BoundsViolation, match="plan length"):
        enforce_plan_bounds(_response([]), "test-1")


def test_two_confirm_steps_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="listings.cancel",
            params={"listingId": "L1"},
            rationale="cancel the open listing for leftover",
            requires_confirmation=True,
        ),
        PlanStep(
            intent="listings.no_show",
            params={"listingId": "L2"},
            rationale="report the no-show on the second listing",
            requires_confirmation=True,
        ),
    ]
    with pytest.raises(BoundsViolation, match="requires_confirmation"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_short_rationale_is_rejected() -> None:
    plan = [PlanStep(intent="leftovers.list", params={}, rationale="too short")]
    with pytest.raises(BoundsViolation, match="rationale"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_safe_until_param_key_is_denied() -> None:
    plan = [
        PlanStep(
            intent="leftovers.record",
            params={
                "dish": "biryani",
                "qty": 5,
                "unit": "plate",
                "safeUntil": "2026-09-04T18:00:00Z",
            },
            rationale="log five plates of biryani as a leftover for the day",
        )
    ]
    with pytest.raises(BoundsViolation, match="safeUntil"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_first_step_destructive_must_confirm() -> None:
    plan = [
        PlanStep(
            intent="listings.cancel",
            params={"listingId": "L1"},
            rationale="cancel the open listing for leftover",
        )
    ]
    with pytest.raises(BoundsViolation, match="requires_confirmation"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_unknown_intent_in_step_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="unknown", params={}, rationale="at least twenty characters of rationale text"
        )
    ]
    with pytest.raises(BoundsViolation, match="must not be 'unknown'"):
        enforce_plan_bounds(_response(plan), "test-1")


def test_needs_clarification_with_plan_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="leftovers.list",
            params={},
            rationale="at least twenty characters of rationale text",
        )
    ]
    with pytest.raises(BoundsViolation, match="needs_clarification"):
        enforce_plan_bounds(_response(plan, needs_clarification=["dish"]), "test-1")


def test_confidence_out_of_range_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="leftovers.list",
            params={},
            rationale="at least twenty characters of rationale text",
        )
    ]
    with pytest.raises(BoundsViolation, match="confidence"):
        enforce_plan_bounds(_response(plan, confidence=1.5), "test-1")


def test_basis_too_short_is_rejected() -> None:
    plan = [
        PlanStep(
            intent="leftovers.list",
            params={},
            rationale="at least twenty characters of rationale text",
        )
    ]
    with pytest.raises(BoundsViolation, match="basis"):
        enforce_plan_bounds(_response(plan, basis="short"), "test-1")


def test_route_smoke_with_deterministic_fallback() -> None:
    response = client.post(
        "/v1/plan-intent",
        json={
            "requestId": "test-route-1",
            "text": "generate report for last 7 days",
            "userRole": "owner",
            "tenantType": "restaurant",
            "today": "2026-09-03",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] in {"deterministic", "model"}
    assert 1 <= len(body["plan"]) <= 6


def test_route_smoke_with_unknown_returns_422() -> None:
    response = client.post(
        "/v1/plan-intent",
        json={
            "requestId": "test-route-2",
            "text": "zxcvbnm",
            "userRole": "owner",
            "tenantType": "restaurant",
            "today": "2026-09-03",
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "BOUNDS_VIOLATION"


def test_route_accepts_snake_case_request() -> None:
    response = client.post(
        "/v1/plan-intent",
        json={
            "request_id": "test-route-3",
            "text": "generate report for last 7 days",
            "user_role": "owner",
            "tenant_type": "restaurant",
            "today": "2026-09-03",
        },
    )
    assert response.status_code == 200


REGISTRY_RELATIVE = Path("packages") / "contracts" / "src" / "intents.ts"


def _find_registry() -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / REGISTRY_RELATIVE
        if candidate.is_file():
            return candidate
    return None


def test_plan_pydantic_resolves_against_registry() -> None:
    from typing import get_args

    from src.schemas.parse_intent import IntentName

    registry = _find_registry()
    if registry is None:
        pytest.skip("intent registry not mounted")
    names = set(re.findall(r'spec\(\s*"([a-z0-9_.]+)"', registry.read_text(encoding="utf-8")))
    plan_step = PlanStep(
        intent="leftovers.list",  # type: ignore[arg-type]
        params={},
        rationale="a rationale long enough to satisfy the bound",
    )
    assert plan_step.intent in get_args(IntentName)
    assert "leftovers.list" in names
