"""Integration tests for the macro/CRED endpoints (issue #114).

Asserts the built-in CRED dataset that the seeder writes into DuckDB is
visible through both ``GET /api/v1/macro/datasets`` and
``POST /api/v1/macro/chart-data``. The minimal fixture in ``conftest``
seeds Egypt × historical × {2024, 2025} × {adp=0.0, adp=0.33} so the
chart-data response shape (years list + datasets list) is fully
deterministic.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_datasets_lists_builtin_cred(seeded_client: TestClient) -> None:
    response = seeded_client.get("/api/v1/macro/datasets")

    assert response.status_code == 200
    body = response.json()
    assert body["status"]["code"] == 2000
    datasets = body["data"]
    assert isinstance(datasets, list)
    assert any(ds.get("is_builtin") for ds in datasets), (
        "built-in CRED seed should appear in /api/v1/macro/datasets"
    )


def test_chart_data_returns_expected_shape(seeded_client: TestClient) -> None:
    response = seeded_client.post(
        "/api/v1/macro/chart-data",
        json={
            "countryName": "egypt",
            "scenario": "historical",
            "sector": "whole_economy",
            "variable": "gdp",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"]["code"] == 2000
    data = body["data"]
    assert data["years"] == [2024, 2025]
    # The minimal fixture has two adaptation levels (0.0 and 0.33); the
    # chart-data handler groups rows by level into separate datasets.
    assert len(data["datasets"]) >= 1
    for series in data["datasets"]:
        assert "label" in series
        assert "data" in series
        assert len(series["data"]) == len(data["years"])
