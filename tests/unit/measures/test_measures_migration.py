"""Tests for the built-in adaptation measures seeder (happy path + validation branches)."""

from __future__ import annotations

from pathlib import Path

import openpyxl
import pytest

from backend.measures.measures_seeder import MeasureSeedError, seed_builtin_measures


def _write_xlsx(path: Path, rows: list[dict]) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    cols = [
        "name",
        "color",
        "cost",
        "hazard intensity impact a",
        "hazard intensity impact b",
        "hazard high frequency cutoff",
        "hazard event set",
        "MDD impact a",
        "MDD impact b",
        "PAA impact a",
        "PAA impact b",
        "damagefunctions map",
        "assets file",
        "Region_ID",
        "risk transfer attachement",
        "risk transfer cover",
        "risk transfer cost factor",
        "peril_ID",
    ]
    ws.append(cols)
    for row in rows:
        ws.append([row.get(c) for c in cols])
    wb.save(path)


def _valid_rows() -> list[dict]:
    return [
        {"name": "green_roofs", "cost": 20_000_000, "MDD impact a": 0.69, "peril_ID": "HW"},
        {"name": "trees_planting", "cost": 31_000_000, "MDD impact a": 0.675, "peril_ID": "HW"},
        {
            "name": "retention_reservoirs",
            "cost": 10_000_000,
            "MDD impact a": 0.85,
            "peril_ID": "FL",
        },
    ]


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_seed_inserts_measure_set_and_rows(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, _valid_rows())

    seed_builtin_measures(migrated_conn, xlsx)

    ms = migrated_conn.execute("SELECT id, name, is_builtin, sha256 FROM measure_sets").fetchall()
    assert len(ms) == 1
    assert ms[0][2] is True
    assert ms[0][3] is not None

    count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert count == 3


def test_seed_maps_columns_correctly(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, _valid_rows()[:1])
    seed_builtin_measures(migrated_conn, xlsx)

    r = migrated_conn.execute(
        "SELECT name, hazard_type, cost_factor, hazard_reduction_percentage, "
        "is_builtin, source_reference FROM adaptation_measures"
    ).fetchone()
    assert r[0] == "green_roofs"
    assert r[1] == "heatwaves"
    assert r[2] == pytest.approx(20_000_000)
    assert r[3] == pytest.approx(31.0)
    assert r[4] is True
    assert r[5] == "TODO — source not yet cited"


def test_seed_no_null_source_reference(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    seed_builtin_measures(migrated_conn, xlsx)

    nulls = migrated_conn.execute(
        "SELECT COUNT(*) FROM adaptation_measures "
        "WHERE source_reference IS NULL AND is_builtin = TRUE"
    ).fetchone()[0]
    assert nulls == 0


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_seed_is_idempotent(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, _valid_rows())

    seed_builtin_measures(migrated_conn, xlsx)
    seed_builtin_measures(migrated_conn, xlsx)

    count = migrated_conn.execute("SELECT COUNT(*) FROM measure_sets").fetchone()[0]
    assert count == 1
    measure_count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert measure_count == 3


def test_changed_file_reseeds(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, _valid_rows()[:1])
    seed_builtin_measures(migrated_conn, xlsx)

    _write_xlsx(xlsx, _valid_rows())
    seed_builtin_measures(migrated_conn, xlsx)

    count = migrated_conn.execute("SELECT COUNT(*) FROM measure_sets").fetchone()[0]
    assert count == 2


# ---------------------------------------------------------------------------
# Validation failures
# ---------------------------------------------------------------------------


def test_cost_factor_zero_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = 0
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError, match="cost_factor must be > 0"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_cost_factor_negative_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = -1
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError, match="cost_factor must be > 0"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_hazard_reduction_out_of_range_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["MDD impact a"] = -0.5  # hazard_reduction_percentage = 150 > 100
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError, match="hazard_reduction_percentage .* outside"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_duplicate_row_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows.append(rows[0].copy())  # duplicate name + hazard_type
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError, match="duplicate"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_missing_required_column_raises(migrated_conn, tmp_path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    ws.append(["name", "cost"])  # missing MDD impact a, peril_ID
    ws.append(["green_roofs", 10_000_000])
    xlsx = tmp_path / "measures.xlsx"
    wb.save(xlsx)

    with pytest.raises(MeasureSeedError, match="missing required columns"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_non_numeric_cost_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = "N/A"
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError, match="'cost' must be numeric"):
        seed_builtin_measures(migrated_conn, xlsx)


def test_file_not_found_raises(migrated_conn, tmp_path: Path) -> None:
    with pytest.raises(MeasureSeedError, match="Cannot open"):
        seed_builtin_measures(migrated_conn, tmp_path / "missing.xlsx")


def test_no_partial_import_on_failure(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[1]["cost"] = 0  # will fail at row 1
    xlsx = tmp_path / "measures.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(MeasureSeedError):
        seed_builtin_measures(migrated_conn, xlsx)

    count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert count == 0
