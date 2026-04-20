"""Tests for GET /api/v1/macro/datasets endpoint."""

from __future__ import annotations


def test_datasets_list_returns_builtin(api_client) -> None:
    resp = api_client.get("/api/v1/macro/datasets")
    assert resp.status_code == 200
    body = resp.json()

    assert "data" in body
    assert "status" in body
    assert body["status"]["code"] == 2000

    datasets = body["data"]
    assert len(datasets) == 1

    ds = datasets[0]
    assert ds["is_builtin"] is True
    assert ds["sha256"] is not None
    assert "id" in ds
    assert "name" in ds
    assert "uploaded_at" in ds


def test_datasets_list_shape_has_all_fields(api_client) -> None:
    ds = api_client.get("/api/v1/macro/datasets").json()["data"][0]
    for field in ["id", "name", "source", "uploaded_at", "is_builtin", "sha256"]:
        assert field in ds


def test_datasets_post_returns_405(api_client) -> None:
    assert api_client.post("/api/v1/macro/datasets", json={}).status_code == 405


def test_datasets_delete_returns_405(api_client) -> None:
    assert api_client.delete("/api/v1/macro/datasets/some-id").status_code == 405
