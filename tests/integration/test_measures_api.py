"""Integration test for ``GET /api/v1/measures/{country}/{hazard}`` (issue #114).

Seeds the built-in adaptation-measures xlsx into a fresh DuckDB and asserts
the endpoint returns at least one measure for the EGY/flood lookup. The
minimal measures fixture in ``conftest`` ships exactly one FL row, so any
drift in the endpoint's join or filter logic will regress to zero rows and
fail the assertion.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_measures_egy_flood_returns_at_least_one(seeded_client: TestClient) -> None:
    response = seeded_client.get("/api/v1/measures/EGY/flood")

    assert response.status_code == 200
    body = response.json()
    assert body["status"]["code"] == 2000
    measures = body["data"]["adaptationMeasures"]
    assert isinstance(measures, list)
    assert len(measures) >= 1
