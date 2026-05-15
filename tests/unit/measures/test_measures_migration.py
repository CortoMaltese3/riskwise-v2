"""Tests for the built-in adaptation measures seeder (happy path + validation branches)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.measures.measures_seeder import MeasureSeedError, seed_builtin_measures


def _write_json(path: Path, rows: list[dict]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


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
    src = tmp_path / "measures.json"
    _write_json(src, _valid_rows())

    seed_builtin_measures(migrated_conn, src)

    ms = migrated_conn.execute("SELECT id, name, is_builtin, sha256 FROM measure_sets").fetchall()
    assert len(ms) == 1
    assert ms[0][2] is True
    assert ms[0][3] is not None

    count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert count == 3


def test_seed_maps_columns_correctly(migrated_conn, tmp_path: Path) -> None:
    src = tmp_path / "measures.json"
    _write_json(src, _valid_rows()[:1])
    seed_builtin_measures(migrated_conn, src)

    r = migrated_conn.execute(
        "SELECT name, hazard_type, cost_factor, hazard_reduction_percentage, "
        "is_builtin, source_reference FROM adaptation_measures"
    ).fetchone()
    assert r[0] == "green_roofs"
    assert r[1] == "heatwaves"
    assert r[2] == pytest.approx(20_000_000)
    assert r[3] == pytest.approx(31.0)
    assert r[4] is True
    # Built-in seeded rows carry a NULL source_reference; the per-row
    # citation lives upstream in the science team's documentation, not
    # in the catalog row.
    assert r[5] is None


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_seed_is_idempotent(migrated_conn, tmp_path: Path) -> None:
    src = tmp_path / "measures.json"
    _write_json(src, _valid_rows())

    seed_builtin_measures(migrated_conn, src)
    seed_builtin_measures(migrated_conn, src)

    count = migrated_conn.execute("SELECT COUNT(*) FROM measure_sets").fetchone()[0]
    assert count == 1
    measure_count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert measure_count == 3


def test_changed_file_does_not_reseed(migrated_conn, tmp_path: Path) -> None:
    # Idempotency is now keyed on the canonical set name — a content
    # edit alone is not enough to trigger a re-seed; bump the version
    # constant when the catalog needs to roll forward.
    src = tmp_path / "measures.json"
    _write_json(src, _valid_rows()[:1])
    seed_builtin_measures(migrated_conn, src)

    _write_json(src, _valid_rows())
    seed_builtin_measures(migrated_conn, src)

    count = migrated_conn.execute("SELECT COUNT(*) FROM measure_sets").fetchone()[0]
    assert count == 1


# ---------------------------------------------------------------------------
# Validation failures
# ---------------------------------------------------------------------------


def test_cost_factor_zero_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = 0
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError, match="cost_factor must be > 0"):
        seed_builtin_measures(migrated_conn, src)


def test_cost_factor_negative_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = -1
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError, match="cost_factor must be > 0"):
        seed_builtin_measures(migrated_conn, src)


def test_hazard_reduction_out_of_range_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["MDD impact a"] = -0.5  # hazard_reduction_percentage = 150 > 100
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError, match="hazard_reduction_percentage .* outside"):
        seed_builtin_measures(migrated_conn, src)


def test_duplicate_row_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows.append(rows[0].copy())  # duplicate name + hazard_type
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError, match="duplicate"):
        seed_builtin_measures(migrated_conn, src)


def test_missing_required_field_raises(migrated_conn, tmp_path: Path) -> None:
    src = tmp_path / "measures.json"
    _write_json(src, [{"name": "green_roofs", "cost": 10_000_000}])

    with pytest.raises(MeasureSeedError, match="missing required fields"):
        seed_builtin_measures(migrated_conn, src)


def test_non_numeric_cost_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["cost"] = "N/A"
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError, match="'cost' must be numeric"):
        seed_builtin_measures(migrated_conn, src)


def test_file_not_found_raises(migrated_conn, tmp_path: Path) -> None:
    with pytest.raises(MeasureSeedError, match="Cannot open"):
        seed_builtin_measures(migrated_conn, tmp_path / "missing.json")


def test_invalid_json_raises(migrated_conn, tmp_path: Path) -> None:
    src = tmp_path / "measures.json"
    src.write_text("not valid json", encoding="utf-8")
    with pytest.raises(MeasureSeedError, match="Invalid JSON"):
        seed_builtin_measures(migrated_conn, src)


def test_no_partial_import_on_failure(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[1]["cost"] = 0  # will fail at row 1
    src = tmp_path / "measures.json"
    _write_json(src, rows)

    with pytest.raises(MeasureSeedError):
        seed_builtin_measures(migrated_conn, src)

    count = migrated_conn.execute("SELECT COUNT(*) FROM adaptation_measures").fetchone()[0]
    assert count == 0
