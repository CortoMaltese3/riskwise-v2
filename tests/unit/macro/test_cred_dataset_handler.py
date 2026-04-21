"""Tests for the CRED dataset upload/delete handler (issue #91)."""

from __future__ import annotations

from pathlib import Path

import duckdb
import openpyxl
import pytest
from macroeconomic.cred_dataset_handler import (
    CredDatasetError,
    delete_dataset,
    get_cred_datasets_dir,
    import_dataset,
    validate_xlsx_schema,
)
from macroeconomic.cred_seeder import CRED_COLUMNS


def _write_xlsx(path: Path, rows: list[dict], sheet_name: str = "cred_output") -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(CRED_COLUMNS)
    for row in rows:
        ws.append([row.get(c) for c in CRED_COLUMNS])
    wb.save(path)


def _valid_rows() -> list[dict]:
    return [
        {
            "country": "egypt",
            "scenario": "historical",
            "adaptation": 0.0,
            "economic_indicator": "gdp",
            "economic_sector": "whole_economy",
            "year": 2024,
            "proportion_change_from_baseline": 0.004,
        },
        {
            "country": "egypt",
            "scenario": "historical",
            "adaptation": 0.33,
            "economic_indicator": "gdp",
            "economic_sector": "whole_economy",
            "year": 2024,
            "proportion_change_from_baseline": 0.008,
        },
    ]


@pytest.fixture
def user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    # The handler writes stored xlsx copies to ``USER_DATA_DIR/cred/``; point
    # it at tmp_path so the tests never touch the developer's
    # ``%APPDATA%/RISK WISE/cred/`` directory.
    user_dir = tmp_path / "user-data"
    user_dir.mkdir()
    monkeypatch.setenv("RISKWISE_USER_DATA", str(user_dir))
    # ``constants.USER_DATA_DIR`` is resolved at import time, so patch the
    # constant already bound in the handler module.
    import macroeconomic.cred_dataset_handler as handler_mod

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
    assert any("missing sheet 'cred_output'" in e.lower() for e in result.errors)


def test_validate_missing_column(tmp_path: Path) -> None:
    xlsx = tmp_path / "missing_col.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    # Omit 'scenario' on purpose.
    cols_without_scenario = [c for c in CRED_COLUMNS if c != "scenario"]
    ws.append(cols_without_scenario)
    ws.append([_valid_rows()[0][c] for c in cols_without_scenario])
    wb.save(xlsx)

    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any(
        "missing column 'scenario' in sheet 'cred_output'" in e.lower() for e in result.errors
    ), result.errors
    # The actionable part of the message must enumerate the full expected set.
    assert any("expected columns" in e.lower() for e in result.errors)


def test_validate_bad_year(tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["year"] = "not_a_year"
    xlsx = tmp_path / "bad_year.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("'year' must be an integer" in e for e in result.errors)


def test_validate_bad_value(tmp_path: Path) -> None:
    rows = _valid_rows()
    rows[0]["proportion_change_from_baseline"] = "N/A"
    xlsx = tmp_path / "bad_value.xlsx"
    _write_xlsx(xlsx, rows)
    result = validate_xlsx_schema(xlsx)
    assert not result.valid
    assert any("must be numeric" in e for e in result.errors)


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

    meta = import_dataset("My CRED", xlsx, conn=migrated_conn)
    assert meta["name"] == "My CRED"
    assert meta["is_builtin"] is False
    assert meta["sha256"] is not None

    # Rows were inserted for this dataset id.
    count = migrated_conn.execute(
        "SELECT COUNT(*) FROM cred_data WHERE dataset_id = ?", [meta["id"]]
    ).fetchone()[0]  # type: ignore[index]
    assert count == 2

    # File was copied under user-data/cred/<id>.xlsx.
    stored = get_cred_datasets_dir() / f"{meta['id']}.xlsx"
    assert stored.is_file(), f"Expected stored copy at {stored}"


def test_import_rejects_invalid_xlsx(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "bad.xlsx"
    _write_xlsx(xlsx, _valid_rows(), sheet_name="not_cred_output")

    with pytest.raises(CredDatasetError, match="Missing sheet 'cred_output'"):
        import_dataset("Bad", xlsx, conn=migrated_conn)

    # Nothing was inserted.
    count = migrated_conn.execute("SELECT COUNT(*) FROM cred_datasets").fetchone()[0]  # type: ignore[index]
    assert count == 0


def test_import_requires_name(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "ok.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    with pytest.raises(CredDatasetError, match="name is required"):
        import_dataset("  ", xlsx, conn=migrated_conn)


def test_delete_custom_dataset_removes_rows_and_file(
    migrated_conn: duckdb.DuckDBPyConnection,
    tmp_path: Path,
    user_data: Path,
) -> None:
    xlsx = tmp_path / "custom.xlsx"
    _write_xlsx(xlsx, _valid_rows())
    meta = import_dataset("My CRED", xlsx, conn=migrated_conn)

    delete_dataset(meta["id"], conn=migrated_conn)

    assert (
        migrated_conn.execute(
            "SELECT COUNT(*) FROM cred_datasets WHERE id = ?", [meta["id"]]
        ).fetchone()[0]  # type: ignore[index]
        == 0
    )
    assert (
        migrated_conn.execute(
            "SELECT COUNT(*) FROM cred_data WHERE dataset_id = ?", [meta["id"]]
        ).fetchone()[0]  # type: ignore[index]
        == 0
    )
    stored = get_cred_datasets_dir() / f"{meta['id']}.xlsx"
    assert not stored.exists()


def test_delete_unknown_dataset_raises(
    migrated_conn: duckdb.DuckDBPyConnection,
) -> None:
    with pytest.raises(CredDatasetError, match="not found"):
        delete_dataset("does-not-exist", conn=migrated_conn)
