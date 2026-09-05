import os

import pytest


@pytest.mark.skipif(os.environ.get("LIVE_LLM") != "1", reason="set LIVE_LLM=1 to run")
def test_graph_smoke_cancel_listing() -> None:
    from fastapi.testclient import TestClient

    from src.main import app

    client = TestClient(app)
    response = client.post(
        "/v1/plan-intent",
        json={
            "requestId": "live-1",
            "text": "cancel that listing",
            "userRole": "owner",
            "tenantType": "restaurant",
            "today": "2026-09-03",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert 1 <= len(body["plan"]) <= 6
    assert body["graph_path"] in {"graph", "flat_fallback", "deterministic"}
