"""Contract test: POST /api/v1/macro/chart-data shape is stable."""

from __future__ import annotations


def test_chart_data_response_shape(api_client) -> None:
    resp = api_client.post(
        "/api/v1/macro/chart-data",
        json={
            "countryName": "egypt",
            "scenario": "historical",
            "sector": "whole_economy",
            "variable": "gdp",
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    assert "data" in body
    assert "status" in body

    data = body["data"]
    assert "years" in data
    assert "datasets" in data
    assert "title" in data

    assert isinstance(data["years"], list)
    assert len(data["years"]) == 2  # 2024, 2025

    assert isinstance(data["datasets"], list)
    assert len(data["datasets"]) >= 1
    for ds in data["datasets"]:
        assert "label" in ds
        assert "data" in ds
        assert isinstance(ds["data"], list)

    assert body["status"]["code"] == 2000


def test_chart_data_missing_fields_returns_error(api_client) -> None:
    resp = api_client.post("/api/v1/macro/chart-data", json={})
    assert resp.status_code == 200
    assert resp.json()["status"]["code"] == 4000


def test_chart_data_unknown_filter_returns_empty(api_client) -> None:
    resp = api_client.post(
        "/api/v1/macro/chart-data",
        json={
            "countryName": "unknown_country",
            "scenario": "historical",
            "sector": "whole_economy",
            "variable": "gdp",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["years"] == []
    assert body["data"]["datasets"] == []
