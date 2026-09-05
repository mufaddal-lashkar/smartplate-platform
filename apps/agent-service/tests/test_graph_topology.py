import asyncio
import json
from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.runnables import Runnable
from langchain_core.tools import tool

from src.llm.graph import run_graph
from src.schemas.plan_intent import PlanIntentRequest


class _StubProvider:
    def __init__(self, replies: list[AIMessage]) -> None:
        self._replies = list(replies)
        self._index = 0
        self.bound_with: list = []

    def bind_tools(self, tools: list[Any]) -> Runnable:
        self.bound_with = list(tools)
        outer = self

        class _Bound:
            async def ainvoke(self, messages: list) -> AIMessage:
                reply = outer._replies[outer._index]
                outer._index += 1
                return reply

        return _Bound()


@tool
def stub_listing_tool() -> str:
    """Stub tool that returns an empty listing payload."""
    return "[]"


def _request() -> PlanIntentRequest:
    return PlanIntentRequest(
        request_id="t",
        text="give me the last 3 days of report",
        user_role="owner",
        tenant_type="restaurant",
        today="2026-09-03",
    )


def test_one_tool_call_then_plan_emits() -> None:
    tool_call = {
        "id": "call_1",
        "name": "stub_listing_tool",
        "args": {},
    }
    plan_json = {
        "plan": [
            {
                "intent": "listings.own",
                "params": {},
                "rationale": "show the user their own listings",
                "requires_confirmation": False,
            }
        ],
        "confidence": 0.9,
        "needsClarification": [],
        "basis": "user asked for their own listings explicitly",
    }
    provider = _StubProvider(
        [
            AIMessage(content="", tool_calls=[tool_call]),
            AIMessage(content=json.dumps(plan_json)),
        ]
    )
    result = asyncio.run(
        run_graph(
            provider,
            tools=[stub_listing_tool],
            request=_request(),
            max_tool_calls=3,
            timeout_seconds=5.0,
        )
    )
    assert result is not None
    assert result.plan[0].intent == "listings.own"
    assert result.confidence == 0.9


def test_cap_hit_with_no_plan_returns_none() -> None:
    provider = _StubProvider(
        [
            AIMessage(
                content="", tool_calls=[{"id": "c1", "name": "stub_listing_tool", "args": {}}]
            ),
            AIMessage(
                content="", tool_calls=[{"id": "c2", "name": "stub_listing_tool", "args": {}}]
            ),
            AIMessage(
                content="", tool_calls=[{"id": "c3", "name": "stub_listing_tool", "args": {}}]
            ),
            AIMessage(content="not json"),
        ]
    )
    result = asyncio.run(
        run_graph(
            provider,
            tools=[stub_listing_tool],
            request=_request(),
            max_tool_calls=3,
            timeout_seconds=5.0,
        )
    )
    assert result is None


def test_plan_payload_first_turn_returns_immediately() -> None:
    plan_json = {
        "plan": [
            {
                "intent": "leftovers.list",
                "params": {},
                "rationale": "user asked for leftovers, list them",
                "requires_confirmation": False,
            }
        ],
        "confidence": 0.7,
        "needsClarification": [],
        "basis": "user asked for leftovers directly",
    }
    provider = _StubProvider([AIMessage(content=json.dumps(plan_json))])
    result = asyncio.run(
        run_graph(
            provider,
            tools=[],
            request=_request(),
            max_tool_calls=3,
            timeout_seconds=5.0,
        )
    )
    assert result is not None
    assert result.plan[0].intent == "leftovers.list"


def test_unknown_intent_dropped_but_plan_surfaces_rest() -> None:
    plan_json = {
        "plan": [
            {
                "intent": "made_up.intent",
                "params": {},
                "rationale": "should be silently dropped from the result",
                "requires_confirmation": False,
            },
            {
                "intent": "menu",
                "params": {},
                "rationale": "fallback menu when nothing else applies",
                "requires_confirmation": False,
            },
        ],
        "confidence": 0.4,
        "needsClarification": [],
        "basis": "user said hello and we did not know what else to do",
    }
    provider = _StubProvider([AIMessage(content=json.dumps(plan_json))])
    result = asyncio.run(
        run_graph(
            provider,
            tools=[],
            request=_request(),
            max_tool_calls=3,
            timeout_seconds=5.0,
        )
    )
    assert result is not None
    assert [s.intent for s in result.plan] == ["menu"]
