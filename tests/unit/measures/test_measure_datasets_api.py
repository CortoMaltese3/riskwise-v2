"""Integration tests for the measure dataset endpoints (issue #92)."""

from __future__ import annotations

from pathlib import Path

import openpyxl
import pytest

REQUIRED_COLS = [
    "measure_id",
    "country",
    "hazard_type",
    "exposure_type",
    "name",
    "cost_factor",
    "hazard_reduction_percentage",
    "description",
    "source_reference",
]


def _valid_row(**overrides: object) -> list[object]:
    base = {
        "measure_id": "m_green_roofs",
        "country": "thailand",
        "hazard_type": "heatwaves",
        "exposure_type": "population",
        "name": "green_roofs",
        "cost_factor": 1.0,
        "hazard_reduction_percentage": 15.0,
        "description": "Install green roofs.",
        "source_reference": "IPCC AR6 WG2 Ch.10",
    }
    base.update(overrides)
    return [base[c] for c in REQUIRED_COLS]


def _custom_xlsx(path: Path, rows: list[list[object]] | None = None) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    ws.append(REQUIRED_COLS)
    for row in rows or [_valid_row(), _valid_row(measure_id="m_seawalls", name="seawalls")]:
        ws.append(row)
    wb.save(path)


@pytest.fixture
def isolated_user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_dir = tmp_path / "user-data"
    user_dir.mkdir()
    monkeypatch.setenv("RISKWISE_USER_DATA", str(user_dir))
    import backend.measures.measure_dataset_handler as handler_mod

    monkeypatch.setattr(handler_mod, "USER_DATA_DIR", user_dir)
    return user_dir


def test_list_returns_builtin(api_client) -> None:
    resp = api_client.get("/api/v1/measures/datasets")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"]["code"] == 2000
    assert any(d["is_builtin"] for d in body["data"])


def test_upload_happy_path(api_client, tmp_path: Path, isolated_user_data: Path) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)

    resp = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "My Custom Measures", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["data"]["name"] == "My Custom Measures"
    assert body["data"]["is_builtin"] is False
    assert body["data"]["measure_count"] == 2
    new_id = body["data"]["id"]

    listed = api_client.get("/api/v1/measures/datasets").json()["data"]
    ids = [d["id"] for d in listed]
    assert new_id in ids
    assert any(d["is_builtin"] for d in listed)


def test_upload_cost_factor_zero_returns_400(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "bad_cost.xlsx"
    _custom_xlsx(xlsx, rows=[_valid_row(cost_factor=0)])

    resp = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Bad", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 400
    assert "'cost_factor' must be > 0" in resp.json()["detail"]


def test_upload_duplicate_measure_id_returns_400(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "dup.xlsx"
    _custom_xlsx(xlsx, rows=[_valid_row(), _valid_row()])

    resp = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Dup", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 400
    assert "duplicate measure_id" in resp.json()["detail"]


def test_delete_builtin_returns_409(api_client) -> None:
    builtin = next(
        d for d in api_client.get("/api/v1/measures/datasets").json()["data"] if d["is_builtin"]
    )
    resp = api_client.delete(f"/api/v1/measures/datasets/{builtin['id']}")
    assert resp.status_code == 409
    assert "built-in" in resp.json()["detail"].lower()


def test_delete_custom_succeeds(api_client, tmp_path: Path, isolated_user_data: Path) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(xlsx)
    created = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Throwaway", "xlsx_path": str(xlsx)},
    ).json()["data"]

    resp = api_client.delete(f"/api/v1/measures/datasets/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == created["id"]

    remaining = [d["id"] for d in api_client.get("/api/v1/measures/datasets").json()["data"]]
    assert created["id"] not in remaining


def test_delete_unknown_returns_404(api_client) -> None:
    resp = api_client.delete("/api/v1/measures/datasets/does-not-exist")
    assert resp.status_code == 404


def test_measures_endpoint_merges_custom_with_builtin(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _custom_xlsx(
        xlsx,
        rows=[_valid_row(country="thailand", hazard_type="heatwaves", name="custom_roofs")],
    )
    api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Thailand extra", "xlsx_path": str(xlsx)},
    ).raise_for_status()

    resp = api_client.get("/api/v1/measures/thailand/heatwaves")
    assert resp.status_code == 200
    data = resp.json()["data"]
    names = [m["name"] for m in data["measures"]]
    assert "custom_roofs" in names
    custom = next(m for m in data["measures"] if m["name"] == "custom_roofs")
    assert custom["is_builtin"] is False
    assert custom["source_reference"]


# ---------------------------------------------------------------------------
# Upload size cap (issue #251) — Area-18 zip-bomb defence.
# ---------------------------------------------------------------------------
#
# A real >50 MiB xlsx would slow the suite without adding signal; the guard
# in ``backend.uploads`` reads ``Path.stat().st_size`` so a sparse file with
# the requested logical size is sufficient to drive the rejection branch.


def _write_sparse(path: Path, size_bytes: int) -> None:
    with path.open("wb") as fh:
        fh.seek(size_bytes - 1)
        fh.write(b"\x00")


def test_upload_above_50_mib_is_rejected_with_structured_error(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    xlsx = tmp_path / "huge.xlsx"
    _write_sparse(xlsx, 51 * 1024 * 1024)

    resp = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Too Big", "xlsx_path": str(xlsx)},
    )
    # 413 Payload Too Large with the structured ``upload_too_large`` code
    # — distinct from the generic 400 ``data_load`` envelope so the
    # renderer can tailor the toast.
    assert resp.status_code == 413
    body = resp.json()
    assert body["code"] == "upload_too_large"
    assert "measures workbook" in body["message"]


def test_upload_below_50_mib_passes_size_gate(
    api_client, tmp_path: Path, isolated_user_data: Path
) -> None:
    # Real 49 MiB xlsx files take seconds to write; a real (small) workbook
    # is the better golden-path proof that the gate did not regress.
    xlsx = tmp_path / "ok.xlsx"
    _custom_xlsx(xlsx)

    resp = api_client.post(
        "/api/v1/measures/datasets",
        json={"name": "Under cap", "xlsx_path": str(xlsx)},
    )
    assert resp.status_code == 200, resp.text
