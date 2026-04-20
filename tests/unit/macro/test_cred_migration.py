"""Tests for the CRED built-in seeder (happy path + validation branches)."""

from __future__ import annotations

from pathlib import Path

import openpyxl
import pytest
from macroeconomic.cred_seeder import CredSeedError, seed_builtin_cred


def _write_xlsx(path: Path, rows: list[dict]) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    cols = [
        "country",
        "scenario",
        "adpatation",
        "economic_indicator",
        "economic_sector",
        "year",
        "proportion_change_from_baseline",
    ]
    ws.append(cols)
    for row in rows:
        ws.append([row.get(c) for c in cols])
    wb.save(path)


def _valid_rows() -> list[dict]:
    return [
        {
            "country": "egypt",
            "scenario": "historical",
            "adpatation": 0.0,
            "economic_indicator": "gdp",
            "economic_sector": "whole_economy",
            "year": 2024,
            "proportion_change_from_baseline": 0.004,
        },
        {
            "country": "egypt",
            "scenario": "historical",
            "adpatation": 0.33,
            "economic_indicator": "gdp",
            "economic_sector": "whole_economy",
            "year": 2024,
            "proportion_change_from_baseline": 0.008,
        },
    ]


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_seed_inserts_dataset_and_rows(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, _valid_rows())

    seed_builtin_cred(migrated_conn, xlsx)

    ds = migrated_conn.execute("SELECT id, name, is_builtin, sha256 FROM cred_datasets").fetchall()
    assert len(ds) == 1
    assert ds[0][2] is True  # is_builtin
    assert ds[0][3] is not None  # sha256 populated

    data_rows = migrated_conn.execute("SELECT COUNT(*) FROM cred_data").fetchone()[0]
    assert data_rows == 2


def test_seed_maps_columns_correctly(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, _valid_rows()[:1])
    seed_builtin_cred(migrated_conn, xlsx)

    r = migrated_conn.execute(
        "SELECT country, scenario, adpatation, variable, sector, year, value FROM cred_data"
    ).fetchone()
    assert r == ("egypt", "historical", 0.0, "gdp", "whole_economy", 2024, pytest.approx(0.004))


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_seed_is_idempotent(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, _valid_rows())

    seed_builtin_cred(migrated_conn, xlsx)
    seed_builtin_cred(migrated_conn, xlsx)

    count = migrated_conn.execute("SELECT COUNT(*) FROM cred_datasets").fetchone()[0]
    assert count == 1
    data_count = migrated_conn.execute("SELECT COUNT(*) FROM cred_data").fetchone()[0]
    assert data_count == 2


def test_changed_file_reseeds(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, _valid_rows()[:1])
    seed_builtin_cred(migrated_conn, xlsx)

    # Overwrite with two rows → different sha256 → re-seed
    _write_xlsx(xlsx, _valid_rows())
    seed_builtin_cred(migrated_conn, xlsx)

    count = migrated_conn.execute("SELECT COUNT(*) FROM cred_datasets").fetchone()[0]
    assert count == 2  # two distinct SHA inserts (both built-in)


# ---------------------------------------------------------------------------
# Validation failures
# ---------------------------------------------------------------------------


def test_missing_required_column_raises(migrated_conn, tmp_path: Path) -> None:
    xlsx = tmp_path / "cred.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    ws.append(["country", "scenario", "year"])  # missing columns
    ws.append(["egypt", "historical", 2024])
    wb.save(xlsx)

    with pytest.raises(CredSeedError, match="missing required columns"):
        seed_builtin_cred(migrated_conn, xlsx)


def test_non_numeric_year_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["year"] = "not_a_year"
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(CredSeedError, match="'year' must be an integer"):
        seed_builtin_cred(migrated_conn, xlsx)


def test_non_numeric_value_raises(migrated_conn, tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["proportion_change_from_baseline"] = "N/A"
    xlsx = tmp_path / "cred.xlsx"
    _write_xlsx(xlsx, rows)

    with pytest.raises(CredSeedError, match="must be numeric"):
        seed_builtin_cred(migrated_conn, xlsx)


def test_file_not_found_raises(migrated_conn, tmp_path: Path) -> None:
    with pytest.raises(CredSeedError, match="Cannot open"):
        seed_builtin_cred(migrated_conn, tmp_path / "missing.xlsx")
