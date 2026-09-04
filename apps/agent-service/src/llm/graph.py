import asyncio
import json
import logging
import time
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.llm.plan_intent_fallback import DESTRUCTIVE_INTENTS, _coerce_params
from src.llm.provider import LLMProvider
from src.schemas.plan_intent import PlanIntentRequest, PlanIntentResponse, PlanStep
from src.tools.main_client import agent_tenant_id, agent_user_id

logger = logging.getLogger(__name__)

PROMPT_VERSION = "graph_v1"
PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "plan_intent"
DATA_PLACEHOLDER = "{{DATA}}"
INTENT_ENUM = frozenset(
    {
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
    }
)


def _prompt_text() -> str:
    return (PROMPT_DIR / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")


def _payload(request: PlanIntentRequest) -> str:
    return request.model_dump_json(indent=2)


def _system_message(request: PlanIntentRequest) -> SystemMessage:
    prompt = _prompt_text()
    text = prompt.replace(DATA_PLACEHOLDER, _payload(request))
    return SystemMessage(content=text)


def _has_plan_payload(message: AIMessage) -> bool:
    if not isinstance(message.content, str):
        return False
    try:
        parsed = json.loads(message.content)
    except (TypeError, ValueError):
        return False
    return isinstance(parsed, dict) and "plan" in parsed


def _plan_from_ai_message(message: AIMessage, _request: PlanIntentRequest) -> PlanIntentResponse:
    raw = json.loads(message.content)  # type: ignore[arg-type]
    plan_steps: list[PlanStep] = []
    for step in raw.get("plan") or []:
        intent = str(step.get("intent", ""))
        if intent not in INTENT_ENUM:
            continue
        llm_confirmation = bool(step.get("requires_confirmation", False))
        forced = intent in DESTRUCTIVE_INTENTS
        plan_steps.append(
            PlanStep(
                intent=intent,  # type: ignore[arg-type]
                params=_coerce_params(step.get("params") or {}),
                rationale=str(step.get("rationale", "")),
                requires_confirmation=forced or llm_confirmation,
            )
        )
    return PlanIntentResponse(
        prompt_version=PROMPT_VERSION,
        model="langgraph",
        source="model",
        plan=plan_steps,
        confidence=float(raw.get("confidence", 0.0)),
        needs_clarification=list(raw.get("needsClarification") or []),
        basis=str(raw.get("basis", "")),
    )


async def run_graph(
    provider: LLMProvider,
    tools: list,
    request: PlanIntentRequest,
    max_tool_calls: int,
    timeout_seconds: float,
) -> PlanIntentResponse | None:
    started = time.monotonic()
    system = _system_message(request)
    initial_messages = [
        system,
        HumanMessage(content=request.text),
    ]
    bound = provider.bind_tools(tools)
    messages: list = list(initial_messages)
    tools_called = 0
    tools_by_name: dict[str, object] = {t.name: t for t in tools}
    tenant_token = agent_tenant_id.set(request.tenant_id)
    user_token = agent_user_id.set(request.user_id)
    try:
        return await _run_graph_loop(
            bound=bound,
            tools_by_name=tools_by_name,
            request=request,
            messages=messages,
            started=started,
            tools_called=tools_called,
            max_tool_calls=max_tool_calls,
            timeout_seconds=timeout_seconds,
        )
    finally:
        agent_tenant_id.reset(tenant_token)
        agent_user_id.reset(user_token)


async def _run_graph_loop(
    bound,
    tools_by_name: dict[str, object],
    request: PlanIntentRequest,
    messages: list,
    started: float,
    tools_called: int,
    max_tool_calls: int,
    timeout_seconds: float,
) -> PlanIntentResponse | None:

    while True:
        if time.monotonic() - started > timeout_seconds:
            logger.warning(
                "graph timeout",
                extra={"request_id": request.request_id, "tools_called": tools_called},
            )
            return None
        try:
            response = await asyncio.wait_for(bound.ainvoke(messages), timeout=10.0)
        except TimeoutError as exc:
            logger.warning(
                "graph llm timeout",
                extra={"request_id": request.request_id, "error": str(exc)},
            )
            return None
        messages = [*messages, response]
        if _has_plan_payload(response):
            try:
                return _plan_from_ai_message(response, request)
            except (ValueError, TypeError) as exc:
                logger.warning(
                    "graph plan parse failed",
                    extra={"request_id": request.request_id, "error": str(exc)},
                )
                return None
        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            return None
        new_tool_messages: list[ToolMessage] = []
        for call in tool_calls:
            name = str(call.get("name", ""))
            args = call.get("args", {}) or {}
            call_id = str(call.get("id", ""))
            tool_obj = tools_by_name.get(name)
            if tool_obj is None:
                logger.warning(
                    "graph tool not found",
                    extra={"request_id": request.request_id, "tool": name},
                )
                return None
            try:
                output = await tool_obj.ainvoke(args)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "graph tool call failed",
                    extra={"request_id": request.request_id, "tool": name, "error": str(exc)},
                )
                output = f"tool error: {exc}"
            new_tool_messages.append(
                ToolMessage(content=str(output), tool_call_id=call_id, name=name)
            )
        messages = [*messages, *new_tool_messages]
        tools_called += len(new_tool_messages)
        if tools_called >= max_tool_calls:
            try:
                final = await asyncio.wait_for(bound.ainvoke(messages), timeout=10.0)
            except TimeoutError:
                return None
            if _has_plan_payload(final):
                return _plan_from_ai_message(final, request)
            return None
