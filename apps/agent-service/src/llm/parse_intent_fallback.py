import re

from src.config import settings
from src.schemas.parse_intent import (
    IntentName,
    ParseIntentRequest,
    ParseIntentResponse,
    RecentMessage,
)

KEYWORD_TABLE: list[tuple[IntentName, list[str]]] = [
    ("help", ["help", "what can you do", "commands"]),
    ("menu", ["menu", "main menu", "show menu"]),
    ("auth.me", ["who am i", "my account"]),
    ("auth.logout", ["logout", "sign out", "log out"]),
    ("sessions.list", ["active sessions", "list sessions"]),
    ("inventory.stock", ["stock", "inventory", "what do i have"]),
    ("inventory.expiring", ["expiring", "about to expire", "soon to expire"]),
    ("inventory.purchases.create", ["purchase", "bought", "received"]),
    ("inventory.adjustments.create", ["adjust", "spillage", "recount"]),
    ("prep.create", ["prep", "prepared", "cooked"]),
    ("prep.reuse_pending", ["reuse pending", "pending reuse"]),
    ("prep.reuse_confirm", ["confirm reuse", "reuse confirmed"]),
    ("leftovers.list", ["leftovers", "leftover"]),
    ("leftovers.record", ["log leftover", "record leftover", "new leftover"]),
    ("leftovers.disposition_suggest", ["suggest", "what should i do with"]),
    ("leftovers.dispositions", ["disposition", "decide", "split"]),
    ("listings.own", ["my listings", "own listings"]),
    ("listings.patch", ["update price", "change price"]),
    ("listings.cancel", ["cancel listing"]),
    ("listings.complete", ["complete listing", "mark collected"]),
    ("listings.no_show", ["no show", "no-show"]),
    ("market.browse", ["browse", "what's available", "open listings"]),
    ("market.mine", ["my claims", "claims"]),
    ("market.claim", ["claim"]),
    ("market.release", ["release", "unclaim"]),
    ("market.pickups", ["pickups", "scheduled pickups"]),
    ("analytics.dashboard", ["dashboard"]),
    ("analytics.waste", ["waste report", "waste analytics"]),
    ("analytics.recovery", ["recovery"]),
    ("analytics.dishes", ["dish performance", "dishes report"]),
    ("analytics.forecasts", ["forecast", "prediction"]),
    ("insights.get", ["insight", "insights"]),
    ("reports.create", ["generate report", "create report", "send me a report"]),
    ("reports.list", ["my reports", "list reports"]),
    ("reports.download", ["download report"]),
    ("tenant.get", ["my tenant", "tenant details"]),
    ("tenant.update", ["update tenant"]),
    ("restaurant.get", ["restaurant details"]),
    ("restaurant.update", ["update restaurant"]),
    ("ngo.get", ["ngo details"]),
    ("ngo.update", ["update ngo"]),
    ("ngo.verification.submit", ["submit verification", "verify my ngo"]),
    ("users.list", ["team", "list users", "my team"]),
    ("users.invite", ["invite", "add user"]),
    ("users.update", ["update user", "change role"]),
    ("users.archive", ["archive user", "deactivate user"]),
    ("permissions.list", ["user permissions"]),
    ("permissions.set", ["grant permission", "allow"]),
    ("permissions.clear", ["revoke permission", "remove permission"]),
    ("admin.tenants.list", ["all tenants", "list tenants"]),
    ("admin.verification.queue", ["pending verifications", "verification queue"]),
    ("admin.verification.decide", ["approve", "reject verification"]),
    ("admin.analytics", ["platform analytics", "platform metrics"]),
    ("catalog.dishes.list", ["dishes", "menu items"]),
    ("catalog.dishes.create", ["add dish", "new dish"]),
    ("catalog.ingredients.list", ["ingredients"]),
    ("catalog.ingredients.create", ["add ingredient", "new ingredient"]),
    ("catalog.suppliers.list", ["suppliers", "vendors"]),
    ("catalog.suppliers.create", ["add supplier", "new supplier"]),
    ("catalog.recipe.get", ["recipe"]),
    ("catalog.recipe.put", ["update recipe", "set recipe"]),
    ("notifications.preferences.get", ["notification preferences", "alert settings"]),
    ("notifications.preferences.set", [
        "update notifications",
        "set quiet hours",
        "change radius",
    ]),
]


NUMERIC_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|piece|pieces|plate|plates)?", re.IGNORECASE)
DATE_PATTERN = re.compile(r"\b(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday)\b", re.IGNORECASE)
SHORT_KEYWORDS = {"me", "menu", "help"}


def _keyword_matches(keyword: str, text: str) -> bool:
    if keyword in SHORT_KEYWORDS:
        return re.search(rf"\b{re.escape(keyword)}\b", text) is not None
    return keyword in text


def _intent_for_text(text: str) -> IntentName:
    lowered = text.lower().strip()
    if lowered.startswith("/"):
        command = lowered.split()[0].lstrip("/")
        for intent, keywords in KEYWORD_TABLE:
            if command in {kw.replace(" ", "-") for kw in keywords}:
                return intent
    for intent, keywords in KEYWORD_TABLE:
        for keyword in keywords:
            if _keyword_matches(keyword, lowered):
                return intent
    return "unknown"


def _extract_entities(text: str, intent: IntentName) -> dict[str, str | float | int | bool | list[str]]:
    entities: dict[str, str | float | int | bool | list[str]] = {}
    lowered = text.lower()
    numeric_matches = NUMERIC_PATTERN.findall(text)
    if numeric_matches:
        for raw_qty, raw_unit in numeric_matches:
            try:
                qty = float(raw_qty)
            except ValueError:
                continue
            if intent == "inventory.purchases.create":
                entities.setdefault("qty", qty)
                if raw_unit:
                    entities.setdefault("unit", raw_unit.lower())
                continue
            if intent == "inventory.adjustments.create":
                entities.setdefault("qty", qty)
                if raw_unit:
                    entities.setdefault("unit", raw_unit.lower())
                continue
            if intent == "prep.create":
                entities.setdefault("qty", qty)
                if raw_unit:
                    entities.setdefault("unit", raw_unit.lower())
                continue
            if intent == "leftovers.record":
                entities.setdefault("qty", qty)
                if raw_unit:
                    entities.setdefault("unit", raw_unit.lower())
                continue
    date_match = DATE_PATTERN.search(lowered)
    if date_match:
        entities.setdefault("serviceDate", date_match.group(1).lower())
    if intent in {"prep.create"} and "lunch" in lowered:
        entities.setdefault("mealPeriod", "lunch")
    elif intent in {"prep.create"} and "dinner" in lowered:
        entities.setdefault("mealPeriod", "dinner")
    elif intent in {"prep.create"} and "breakfast" in lowered:
        entities.setdefault("mealPeriod", "breakfast")
    return entities


def deterministic_parse_intent(
    request: ParseIntentRequest,
) -> ParseIntentResponse:
    intent = _intent_for_text(request.text)
    entities = _extract_entities(request.text, intent)
    needs_clarification: list[str] = []
    if intent == "unknown":
        needs_clarification = ["intent"]
    elif intent in {"inventory.purchases.create", "prep.create", "leftovers.record"}:
        if "qty" not in entities:
            needs_clarification.append("qty")
        if "unit" not in entities and intent == "inventory.purchases.create":
            needs_clarification.append("unit")
    return ParseIntentResponse(
        prompt_version="v1-fallback",
        model=settings.gemini_model,
        source="deterministic",
        intent=intent,
        confidence=0.4 if intent == "unknown" else 0.6,
        entities=entities,
        needs_clarification=needs_clarification,
        basis=f"deterministic keyword match against free-form text ({len(request.text)} chars)",
    )


def fallback_context(messages: list[RecentMessage]) -> str:
    return " | ".join(f"{m.role}:{m.text[:60]}" for m in messages[-3:])
