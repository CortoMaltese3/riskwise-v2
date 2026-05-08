"""Integration test for the scenario run + SSE pipeline (issue #114).

Exercises the full handshake end-to-end without booting CLIMADA:

1. ``POST /api/v1/scenario/run`` accepts a synthetic EGY flood payload and
   returns a job_id.
2. The in-process worker (stubbed to skip CLIMADA and persist directly to
   DuckDB, matching what the real :class:`RunScenario` does) emits a
   result event on the SSE stream and closes it.
3. The persisted row is reachable via single-row GET even before the user
   saves it, but stays out of the workspace list until ``POST
   /scenarios/{id}/save`` flips ``saved`` to TRUE.

The SSE delivery signal is the ``{"type": "result", ...}`` event emitted
by ``backend.app._execute_scenario`` — that is what the Electron renderer
treats as "scenario done". The issue's ``status: done`` phrasing is
matched here by the result envelope's ``status.code == 2000`` field.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

import backend.app as app_module

_SYNTHETIC_EGY_FLOOD_PAYLOAD: dict = {
    "countryName": "egypt",
    "hazardType": "flood",
    "scenario": "rcp85",
    "exposureType": "assets",
    "assetType": "economic",
    "timeHorizon": [2024, 2050],
    "annualGrowth": 0.02,
    "isEra": False,
    "random_seed": 42,
}


def _minimal_provenance(random_seed: int = 42) -> dict:
    """Smallest dict that satisfies ``scenarios`` table NOT NULL constraints."""
    return {
        "app_version": "2.0.0-test",
        "engine_version": "test",
        "climada_version": "6.1.0",
        "entity_data_sha256": "0" * 64,
        "hazard_data_sha256": "0" * 64,
        "country_config_sha256": "0" * 64,
        "config_version": "test",
        "random_seed": random_seed,
    }


def _fake_run_scenario(scenario_id: str = "job-test-fixture") -> dict:
    """Stand-in for :func:`backend.app._run_scenario_sync`.

    Mirrors the real runner's contract: persist a scenarios row for the
    given id, then return the envelope the frontend expects. Keeping the
    persistence side-effect inside the stub is what lets the test assert
    "result row appears in DuckDB" without touching CLIMADA.
    """
    from backend.db import insert_scenario

    def _impl(payload: dict) -> dict:
        insert_scenario(
            scenario_id,
            payload,
            {},
            provenance=_minimal_provenance(int(payload.get("random_seed", 42))),
            name="EGY flood 2050 (synthetic)",
        )
        return {
            "data": {
                "scenario_id": scenario_id,
                "mapTitle": "EGY flood 2050 (synthetic)",
            },
            "status": {"code": 2000, "message": "ok"},
        }

    return _impl  # type: ignore[return-value]


def _collect_sse(response) -> list[dict]:
    """Parse the SSE payload produced by ``/scenario/{id}/stream``."""
    events: list[dict] = []
    for line in response.iter_lines():
        if not line:
            continue
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def test_scenario_run_persists_row_and_emits_result_event(api_client: TestClient) -> None:
    with patch.object(app_module, "_run_scenario_sync", side_effect=_fake_run_scenario()):
        accepted = api_client.post("/api/v1/scenario/run", json=_SYNTHETIC_EGY_FLOOD_PAYLOAD)
        assert accepted.status_code == 200
        job_id = accepted.json()["job_id"]
        assert job_id

        with api_client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
            assert stream.status_code == 200
            events = _collect_sse(stream)

    result_events = [e for e in events if e.get("type") == "result"]
    assert len(result_events) == 1, f"expected exactly one result event, got {events}"
    assert result_events[0]["data"]["status"]["code"] == 2000

    detail = api_client.get("/api/v1/scenarios/job-test-fixture")
    assert detail.status_code == 200
    assert detail.json()["data"]["scenario"]["id"] == "job-test-fixture"
    assert detail.json()["data"]["scenario"]["saved"] is False

    listed_before = api_client.get("/api/v1/scenarios")
    assert listed_before.status_code == 200
    assert all(row["id"] != "job-test-fixture" for row in listed_before.json()["data"])

    saved = api_client.post(
        "/api/v1/scenarios/job-test-fixture/save",
        json={"name": "EGY flood 2050 (synthetic)"},
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["saved"] is True

    listed_after = api_client.get("/api/v1/scenarios")
    assert listed_after.status_code == 200
    rows = listed_after.json()["data"]
    assert any(row["id"] == "job-test-fixture" for row in rows), (
        f"saved scenario row not visible via /api/v1/scenarios: {rows}"
    )
