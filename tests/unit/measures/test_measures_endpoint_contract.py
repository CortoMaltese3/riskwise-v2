"""Contract tests for GET /api/v1/measures/{country}/{hazard}.

Verifies the response shape matches what the frontend measure-selection UI
consumes, and that the optional measure_set_id query param works correctly.
"""

from __future__ import annotations


def test_measures_endpoint_returns_list_for_heatwaves(api_client) -> None:
    resp = api_client.get("/api/v1/measures/egy/heatwaves")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "adaptationMeasures" in body["data"]
    assert isinstance(body["data"]["adaptationMeasures"], list)
    assert "status" in body
    assert body["status"]["code"] == 2000


def test_measures_endpoint_returns_list_for_flood(api_client) -> None:
    resp = api_client.get("/api/v1/measures/egy/flood")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["data"]["adaptationMeasures"], list)
    assert len(body["data"]["adaptationMeasures"]) > 0


def test_measures_endpoint_unknown_hazard_returns_empty(api_client) -> None:
    resp = api_client.get("/api/v1/measures/egy/unknown_hazard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["adaptationMeasures"] == []
    assert body["status"]["code"] == 3000


def test_measures_endpoint_builtin_set_default(api_client) -> None:
    resp = api_client.get("/api/v1/measures/egy/heatwaves")
    assert resp.status_code == 200
    measures = resp.json()["data"]["adaptationMeasures"]
    assert len(measures) >= 2  # minimal fixture has 2 HW measures


def test_measures_endpoint_explicit_measure_set_id(api_client, seeded_db) -> None:
    import duckdb

    conn = duckdb.connect(str(seeded_db))
    row = conn.execute("SELECT id FROM measure_sets WHERE is_builtin = TRUE").fetchone()
    conn.close()
    assert row is not None
    set_id = row[0]

    resp = api_client.get(f"/api/v1/measures/egy/heatwaves?measure_set_id={set_id}")
    assert resp.status_code == 200
    measures = resp.json()["data"]["adaptationMeasures"]
    assert len(measures) >= 2


def test_measures_endpoint_nonexistent_set_id_returns_empty(api_client) -> None:
    resp = api_client.get("/api/v1/measures/egy/heatwaves?measure_set_id=nonexistent-id")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["adaptationMeasures"] == []
