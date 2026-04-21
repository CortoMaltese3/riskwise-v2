"""Integration tests for the CRED dataset endpoints (issue #91).

Exercises the real FastAPI app against the seeded DuckDB fixture from
``conftest.py``. Covers: upload happy path, schema validation error,
delete round-trip, 409 on built-in delete, and dataset_id pass-through on
the chart-data endpoint.
"""

from __future__ import annotations

from pathlib import Path

import openpyxl
import pytest

from .conftest import write_minimal_xlsx

REQUIRED_COLS = [
    "country",
    "scenario",
    "adpatation",
    "economic_indicator",
    "economic_sector",
    "year",
    "proportion_change_from_baseline",
]


def _custom_xlsx(path: Path) -> None:
    """Write an xlsx with a different country than the built-in fixture."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    ws.append(REQUIRED_COLS)
    for year in (2024, 2025):
        for adp in (0.0, 0.5):
            ws.append(["thailand", "historical", adp, "gdp", "whole_economy", year, 0.123])
    wb.save(path)


@pytest.fixture
def isolated_user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point ``USER_DATA_DIR`` at tmp_path so xlsx copies stay in the sandbox."""
    user_dir = tmp_path / "user-data"
    user_dir.mkdir()
    monkeypatch.setenv("RISKWISE_USER_DATA", str(user_dir))
    import macroeconomic.cred_dataset_handler as handler_mod

    monkeypatch.setattr(handler_mod, "USER_DATA_DIR", user_dir)
    return user_dir


def test_upload_happy_path(api_client, tmp_path: Path, isolated_user_data: Path) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)

    resp = api_client.post(
        "/api/v1/macro/datasets",
        json={"name": "My Custom CRED", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"]["code"] == 2000
    assert body["data"]["name"] == "My Custom CRED"
    assert body["data"]["is_builtin"] is False
    new_id = body["data"]["id"]

    # It now shows up in the list (built-in + new).
    listed = api_client.get("/api/v1/macro/datasets").json()["data"]
    ids = [d["id"] for d in listed]
    assert new_id in ids
    assert any(d["is_builtin"] for d in listed)


def test_upload_missing_column_returns_400_with_actionable_message(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "bad.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    # Omit 'scenario' — matches the column the issue names in its example.
    cols = [c for c in REQUIRED_COLS if c != "scenario"]
    ws.append(cols)
    ws.append(["egypt", 0.0, "gdp", "whole_economy", 2024, 0.1])
    wb.save(xlsx)

    resp = api_client.post(
        "/api/v1/macro/datasets",
        json={"name": "Bad", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "Missing column 'scenario' in sheet 'cred_output'" in detail
    assert "Expected columns" in detail


def test_delete_builtin_returns_409(api_client) -> None:
    builtin = next(
        d for d in api_client.get("/api/v1/macro/datasets").json()["data"] if d["is_builtin"]
    )
    resp = api_client.delete(f"/api/v1/macro/datasets/{builtin['id']}")
    assert resp.status_code == 409
    assert "built-in" in resp.json()["detail"].lower()


def test_delete_custom_succeeds(api_client, tmp_path: Path, isolated_user_data: Path) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)
    created = api_client.post(
        "/api/v1/macro/datasets",
        json={"name": "Throwaway", "xlsx_path": str(xlsx)},
    ).json()["data"]

    resp = api_client.delete(f"/api/v1/macro/datasets/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == created["id"]

    remaining_ids = [d["id"] for d in api_client.get("/api/v1/macro/datasets").json()["data"]]
    assert created["id"] not in remaining_ids


def test_chart_data_uses_custom_dataset_when_id_provided(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    # Built-in seeds egypt only (see conftest.write_minimal_xlsx); the custom
    # xlsx above seeds thailand. A query against 'thailand' on the built-in
    # returns no rows, while the same query with the custom dataset_id does.
    _ = write_minimal_xlsx  # guard against removal of the helper
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)
    created = api_client.post(
        "/api/v1/macro/datasets",
        json={"name": "Thailand CRED", "xlsx_path": str(xlsx)},
    ).json()["data"]

    # Without dataset_id → falls back to built-in, no thailand rows.
    fallback = api_client.post(
        "/api/v1/macro/chart-data",
        json={
            "countryName": "thailand",
            "scenario": "historical",
            "sector": "whole_economy",
            "variable": "gdp",
        },
    ).json()
    assert fallback["data"]["years"] == []

    # With dataset_id → hits the uploaded rows.
    hit = api_client.post(
        "/api/v1/macro/chart-data",
        json={
            "countryName": "thailand",
            "scenario": "historical",
            "sector": "whole_economy",
            "variable": "gdp",
            "dataset_id": created["id"],
        },
    ).json()
    assert hit["data"]["years"] == [2024, 2025]
    assert len(hit["data"]["datasets"]) >= 1


def test_cred_output_uses_dataset_id_query_param(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)
    created = api_client.post(
        "/api/v1/macro/datasets",
        json={"name": "Thailand CRED", "xlsx_path": str(xlsx)},
    ).json()["data"]

    built_in_rows = api_client.get("/api/v1/macro/cred-output").json()["data"]
    assert all(r["country"] == "egypt" for r in built_in_rows)

    custom_rows = api_client.get(f"/api/v1/macro/cred-output?dataset_id={created['id']}").json()[
        "data"
    ]
    assert len(custom_rows) > 0
    assert all(r["country"] == "thailand" for r in custom_rows)
