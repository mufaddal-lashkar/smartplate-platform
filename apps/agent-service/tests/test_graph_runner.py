import asyncio

from src.config import settings
from src.llm import graph_runner
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse, PlanStep


def _request() -> PlanIntentRequest:
    return PlanIntentRequest(
        request_id="r1",
        text="list my listings",
        user_role="owner",
        tenant_type="restaurant",
        today="2026-09-03",
    )


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_kill_switch_routes_to_deterministic(monkeypatch) -> None:
    monkeypatch.setattr(settings, "plan_intent_graph_enabled", False)
    monkeypatch.setattr(settings, "gemini_api_key", "")

    async def fake_run(*_a, **_k):
        return None

    monkeypatch.setattr(graph_runner, "run_graph", fake_run)

    result = _run(graph_runner.run_plan_intent_graph(_request()))
    assert result.graph_path == "deterministic"
    assert result.source == "deterministic"


def test_no_gemini_key_routes_to_deterministic(monkeypatch) -> None:
    monkeypatch.setattr(settings, "plan_intent_graph_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "")
    result = _run(graph_runner.run_plan_intent_graph(_request()))
    assert result.graph_path == "deterministic"


def test_no_gemini_key_with_working_flat_falls_back(monkeypatch) -> None:
    monkeypatch.setattr(settings, "plan_intent_graph_enabled", False)
    monkeypatch.setattr(settings, "gemini_api_key", "stub-key")

    plan_response = PlanIntentResponse(
        prompt_version="v1",
        model="gemini-2.5-flash",
        source="model",
        plan=[],
        confidence=0.2,
        needs_clarification=[],
        basis="flat path returned a plan",
    )

    async def fake_flat(*_a, **_k):
        return plan_response

    monkeypatch.setattr(graph_runner, "gemini_plan_intent", fake_flat)
    result = _run(graph_runner.run_plan_intent_graph(_request()))
    assert result.graph_path == "flat_fallback"


def test_graph_returns_none_falls_back_to_deterministic(monkeypatch) -> None:
    monkeypatch.setattr(settings, "plan_intent_graph_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "stub-key")

    async def fake_run(*_a, **_k):
        return None

    async def fake_flat(*_a, **_k):
        return None

    monkeypatch.setattr(graph_runner, "run_graph", fake_run)
    monkeypatch.setattr(graph_runner, "gemini_plan_intent", fake_flat)

    result = _run(graph_runner.run_plan_intent_graph(_request()))
    assert result.graph_path == "deterministic"


def test_graph_returns_plan_uses_graph_path(monkeypatch) -> None:
    monkeypatch.setattr(settings, "plan_intent_graph_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "stub-key")

    plan_response = PlanIntentResponse(
        prompt_version="graph_v1",
        model="langgraph",
        source="model",
        plan=[
            PlanStep(
                intent="leftovers.list",
                params={},
                rationale="a long enough rationale string",
            )
        ],
        confidence=0.9,
        needs_clarification=[],
        basis="graph returned a usable plan",
    )

    async def fake_run(*_a, **_k):
        return plan_response

    monkeypatch.setattr(graph_runner, "run_graph", fake_run)

    result = _run(graph_runner.run_plan_intent_graph(_request()))
    assert result.graph_path == "graph"
    assert result.plan[0].intent == "leftovers.list"
