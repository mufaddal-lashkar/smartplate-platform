from fastapi.testclient import TestClient

from src.llm.parse_intent_fallback import deterministic_parse_intent
from src.main import app
from src.schemas.parse_intent import ParseIntentRequest

client = TestClient(app)


def _payload(text: str, role: str = "owner", tenant: str = "restaurant") -> dict:
    return {
        "request_id": "test-1",
        "text": text,
        "locale": "en-IN",
        "context": [],
        "user_role": role,
        "tenant_type": tenant,
    }


def _request(text: str, role: str = "owner", tenant: str = "restaurant") -> ParseIntentRequest:
    return ParseIntentRequest.model_validate(_payload(text, role, tenant))


def test_help_intent():
    body = client.post("/v1/parse-intent", json=_payload("help")).json()
    assert body["intent"] == "help"
    assert body["source"] in {"deterministic", "model"}
    assert 0.0 <= body["confidence"] <= 1.0


def test_unknown_intent_for_garbage():
    result = deterministic_parse_intent(_request("zxcvbnm qqqqq"))
    assert result.intent == "unknown"
    assert result.confidence < 0.5


def test_purchase_intent_extracts_qty_and_unit():
    result = deterministic_parse_intent(_request("bought 3 kg of basmati"))
    assert result.intent == "inventory.purchases.create"
    assert result.entities.get("qty") == 3
    assert result.entities.get("unit") == "kg"


def test_prep_intent_extracts_meal_period():
    result = deterministic_parse_intent(_request("prepped 2 kg rice for lunch"))
    assert result.intent == "prep.create"
    assert result.entities.get("mealPeriod") == "lunch"
    assert result.entities.get("qty") == 2


def test_basis_meets_minimum_length():
    result = deterministic_parse_intent(_request("show my stock"))
    assert len(result.basis) >= 20


def test_admin_queue_intent_for_super_admin():
    result = deterministic_parse_intent(_request("pending verifications", role="super_admin"))
    assert result.intent == "admin.verification.queue"


def test_browse_intent_for_ngo():
    result = deterministic_parse_intent(
        _request("browse listings near me", role="ngo_admin", tenant="ngo")
    )
    assert result.intent == "market.browse"


import re
from pathlib import Path
from typing import get_args

from fastapi.testclient import TestClient

from src.main import app
from src.schemas.parse_intent import IntentName

REGISTRY = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "intents.ts"


def _registry_intent_names() -> set[str]:
    source = REGISTRY.read_text(encoding="utf-8")
    return set(re.findall(r'spec\(\s*"([a-z0-9_.]+)"', source))


def test_python_literal_matches_the_typescript_registry() -> None:
    python_names = set(get_args(IntentName)) - {"unknown"}
    assert python_names == _registry_intent_names()


def test_parse_intent_accepts_camel_case_from_bot_service() -> None:
    client = TestClient(app)
    response = client.post(
        "/v1/parse-intent",
        json={
            "requestId": "chat-1-42",
            "text": "what do i have in stock",
            "userRole": "owner",
            "tenantType": "restaurant",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "inventory.stock"
    assert "data" not in body


def test_parse_intent_still_accepts_snake_case() -> None:
    client = TestClient(app)
    response = client.post(
        "/v1/parse-intent",
        json={
            "request_id": "chat-1-43",
            "text": "what do i have in stock",
            "user_role": "owner",
            "tenant_type": "restaurant",
        },
    )
    assert response.status_code == 200
    assert response.json()["intent"] == "inventory.stock"
