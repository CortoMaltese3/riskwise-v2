"""Tests for the adaptation measure dataset handler (issue #92)."""

from __future__ import annotations

from pathlib import Path

import duckdb
import openpyxl
import pytest
from measures.measure_dataset_handler import (
    MeasureDatasetError,
    MeasureDatasetNotFound,
    MeasureDatasetProtected,
    delete_dataset,
    get_measure_datasets_dir,
    import_dataset,
    validate_xlsx_schema,
)

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


def _write_xlsx(path: Path, rows: list[dict], sheet_name: str = "measures") -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(REQUIRED_COLS)
    for row in rows:
        ws.append([row.get(c) for c in REQUIRED_COLS])
    wb.save(path)


def _valid_rows() -> list[dict]:
    return [
        {
            "measure_id": "m_green_roofs",
            "country": "thailand",
            "hazard_type": "heatwaves",
            "exposure_type": "population",
            "name": "green_roofs",
            "cost_factor": 1.0,
            "hazard_reduction_percentage": 15.0,
            "description": "Install green roofs.",
            "source_reference": "IPCC AR6 WG2 Ch.10",
        },
        {
            "measure_id": "m_seawalls",
            "country": "thailand",
            "hazard_type": "flood",
            "exposure_type": "population",
            "name": "seawalls",
            "cost_factor": 2.5,
            "hazard_reduction_percentage": 45.0,
            "description": "Coastal seawalls.",
            "source_reference": "WB Cost-Benefit Atlas 2022",
        },
    ]


@pytest.fixture
def user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_dir = tmp_path / "user-data"
    user_dir.mkdir()
    monkeypatch.setenv("RISKWISE_USER_DATA", str(user_dir))
    import measures.measure_dataset_handler as handler_mod

    monkeypatch.setattr(handler_mod, "USER_DATA_DIR", user_dir)
    return user_dir


# ---------------------------------------------------------------------------
# validate_xlsx_schema
# ---------------------------------------------------------------------------


def test_validate_happy_path(tmp_path: Path) -> None:
    xlsx = tmp_path / "ok.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    result = validate_xlsx_schema(xlsx)
    assert result.valid, result.errors


def test_validate_missing_file(tmp_path: Path) -> None:
    result = validate_xlsx_schema(tmp_path / "nope.xlsx")
    assert not result.valid
    assert "not found" in result.errors[0].lower()


def test_validate_missing_sheet(tmp_path: Path) -> None:
    xlsx = tmp_path / "wrong_sheet.xlsx"
    _write_xlsx(xlsx, _valid_rows(), sheet_name="other_sheet")
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("missing sheet 'measures'" in e.lower() for e in result.errors)


def test_validate_missing_column(tmp_path: Path) -> None:
    xlsx = tmp_path / "missing_col.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    cols_without_cost = [c for c in REQUIRED_COLS if c != "cost_factor"]
    ws.append(cols_without_cost)
    ws.append([_valid_rows()[0][c] for c in cols_without_cost])
    wb.save(xlsx)

    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any(
        "missing column 'cost_factor' in sheet 'measures'" in e.lower() for e in result.errors
    ), result.errors
    assert any("expected columns" in e.lower() for e in result.errors)


def test_validate_cost_factor_zero_rejected(tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost_factor"] = 0
    xlsx = tmp_path / "bad_cost.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("'cost_factor' must be > 0" in e for e in result.errors)


def test_validate_cost_factor_non_numeric_rejected(tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost_factor"] = "free"
    xlsx = tmp_path / "bad_cost.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("'cost_factor' must be numeric" in e for e in result.errors)


def test_validate_hazard_reduction_out_of_range(tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["hazard_reduction_percentage"] = 150
    xlsx = tmp_path / "bad_hrp.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("hazard_reduction_percentage" in e and "[0, 100]" in e for e in result.errors)


def test_validate_duplicate_measure_id_rejected(tmp_path: Path) -> None:
    rows = _valid_rows()
    dup = dict(rows[0])
    rows.append(dup)
    xlsx = tmp_path / "dup.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("duplicate measure_id" in e for e in result.errors)


# ---------------------------------------------------------------------------
# import_dataset / delete_dataset
# ---------------------------------------------------------------------------


def test_import_inserts_metadata_and_data(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _write_xlsx(xlsx, _valid_rows())

    meta = import_dataset("My Measures", xlsx, conn=migrated_conn)
    assert meta["name"] == "My Measures"
    assert meta["is_builtin"] is False
    assert meta["sha256"] is not None
    assert meta["measure_count"] == 2

    count = migrated_conn.execute(
        "SELECT COUNT(*) FROM adaptation_measures WHERE measure_set_id = ?", [meta["id"]]
    ).fetchone()[0]
    assert count == 2

    stored = get_measure_datasets_dir() / f"{meta['id']}.xlsx"
    assert stored.is_file(), f"Expected stored copy at {stored}"


def test_import_rejects_invalid_xlsx(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "bad.xlsx"
    _write_xlsx(xlsx, _valid_rows(), sheet_name="not_measures")

    with pytest.raises(MeasureDatasetError, match="Missing sheet 'measures'"):
        import_dataset("Bad", xlsx, conn=migrated_conn)

    count = migrated_conn.execute(
        "SELECT COUNT(*) FROM measure_sets WHERE is_builtin = FALSE"
    ).fetchone()[0]
    assert count == 0


def test_import_requires_name(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "ok.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    with pytest.raises(MeasureDatasetError, match="name is required"):
        import_dataset("  ", xlsx, conn=migrated_conn)


def test_delete_custom_dataset_removes_rows_and_file(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    meta = import_dataset("My Measures", xlsx, conn=migrated_conn)

    delete_dataset(meta["id"], conn=migrated_conn)

    assert (
        migrated_conn.execute(
            "SELECT COUNT(*) FROM measure_sets WHERE id = ?", [meta["id"]]
        ).fetchone()[0]
        == 0
    )
    assert (
        migrated_conn.execute(
            "SELECT COUNT(*) FROM adaptation_measures WHERE measure_set_id = ?", [meta["id"]]
        ).fetchone()[0]
        == 0
    )
    stored = get_measure_datasets_dir() / f"{meta['id']}.xlsx"
    assert not stored.exists()


def test_delete_unknown_dataset_raises(
    migrated_conn: duckdb.DuckDBPyConnection,
) -> None:
    with pytest.raises(MeasureDatasetNotFound, match="not found"):
        delete_dataset("does-not-exist", conn=migrated_conn)


def test_delete_builtin_raises_protected(
    migrated_conn: duckdb.DuckDBPyConnection,
) -> None:
    migrated_conn.execute(
        """
        INSERT INTO measure_sets (id, name, sha256, is_builtin)
        VALUES ('builtin-id', 'Built-in', 'deadbeef', TRUE)
        """
    )
    with pytest.raises(MeasureDatasetProtected, match="built-in"):
        delete_dataset("builtin-id", conn=migrated_conn)
