from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

PAYLOAD = {
    "request_id": "test-1",
    "leftover": {
        "dish_ref": "dish-1",
        "dish_name": "Cooked rice",
        "qty": 10.0,
        "unit": "kg",
        "prepared_at": "2026-08-02T19:20:00Z",
        "safe_until": "2026-08-03T19:20:00Z",
        "storage": "refrigerated",
        "is_reusable": True,
        "reuse_route": "fried rice",
    },
    "dish_reuse_history": [
        {"service_date": "2026-07-30", "retained_qty": 5.0, "actually_reused_qty": 4.0},
        {"service_date": "2026-07-29", "retained_qty": 6.0, "actually_reused_qty": 6.0},
    ],
    "tomorrow_menu": ["Fried rice", "Dal tadka"],
    "cost_basis_per_unit": 42.0,
    "past_listing_outcomes": [{"price_per_unit": 50.0, "channel": "b2b", "sold": True}],
}


def test_split_sums_to_leftover_quantity():
    response = client.post("/v1/reuse-estimate", json=PAYLOAD)
    assert response.status_code == 200

    body = response.json()
    total = body["suggested_retain_qty"] + body["suggested_sell_qty"] + body["suggested_donate_qty"]
    assert abs(total - PAYLOAD["leftover"]["qty"]) < 0.01


def test_returns_a_usable_answer_without_a_key():
    body = client.post("/v1/reuse-estimate", json=PAYLOAD).json()
    assert body["source"] in {"model", "deterministic"}
    assert len(body["basis"]) >= 20


def test_non_reusable_dish_retains_nothing():
    payload = {**PAYLOAD, "leftover": {**PAYLOAD["leftover"], "is_reusable": False}}
    body = client.post("/v1/reuse-estimate", json=payload).json()
    assert body["suggested_retain_qty"] == 0.0
