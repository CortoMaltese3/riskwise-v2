"""Integration: scenario inserts require a complete provenance dict.

``insert_scenario`` rejects missing provenance fields at the handler
level so a traceback points at the offending key. The DB constraint is a
secondary belt-and-braces defence; verifying both ensures either layer
catches a partial insert on its own.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    get_scenario,
    insert_scenario,
    run_migrations,
)


@pytest.fixture
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "workspace.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db_path))
    conn = duckdb.connect(str(db_path))
    try:
        run_migrations(conn, migrations_dir=MIGRATIONS_DIR)
    finally:
        conn.close()
    return db_path


_PARAMS = {
    "country": "Egypt",
    "hazard_type": "flood",
    "scenario": "rcp85",
    "exposure_economic": "crops",
    "exposure_non_economic": "",
    "ref_year": 2024,
    "future_year": 2050,
    "annual_growth": 2.0,
    "is_era": True,
    "app_option": "era",
}

_FULL_PROVENANCE = {
    "app_version": "2.0.0-dev",
    "engine_version": "2.0.0-dev",
    "climada_version": "4.1.1",
    "entity_data_sha256": "0" * 64,
    "hazard_data_sha256": "1" * 64,
    "country_config_sha256": "2" * 64,
    "config_version": "3",
    "random_seed": 77,
}


def test_scenarios_table_has_provenance_columns(tmp_db: Path) -> None:
    conn = duckdb.connect(str(tmp_db))
    try:
        cols = {
            row[0]
            for row in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'scenarios'"
            ).fetchall()
        }
    finally:
        conn.close()
    # All nine reproducibility columns from migration 0002 must be present.
    assert {
        "app_version",
        "engine_version",
        "climada_version",
        "entity_data_sha256",
        "hazard_data_sha256",
        "country_config_sha256",
        "config_version",
        "random_seed",
        "computed_at",
    }.issubset(cols)


def test_insert_populates_provenance_columns(tmp_db: Path) -> None:
    insert_scenario(
        "s-prov-1",
        _PARAMS,
        results={"impact_summary": b"{}"},
        provenance=_FULL_PROVENANCE,
        name="seeded run",
    )

    conn = duckdb.connect(str(tmp_db))
    try:
        row = conn.execute(
            """
            SELECT app_version, engine_version, climada_version,
                   entity_data_sha256, hazard_data_sha256, country_config_sha256,
                   config_version, random_seed
            FROM scenarios WHERE id = ?
            """,
            ["s-prov-1"],
        ).fetchone()
    finally:
        conn.close()

    assert row == (
        _FULL_PROVENANCE["app_version"],
        _FULL_PROVENANCE["engine_version"],
        _FULL_PROVENANCE["climada_version"],
        _FULL_PROVENANCE["entity_data_sha256"],
        _FULL_PROVENANCE["hazard_data_sha256"],
        _FULL_PROVENANCE["country_config_sha256"],
        _FULL_PROVENANCE["config_version"],
        _FULL_PROVENANCE["random_seed"],
    )

    detail = get_scenario("s-prov-1")
    assert detail is not None


def test_insert_missing_provenance_raises(tmp_db: Path) -> None:
    incomplete = {k: v for k, v in _FULL_PROVENANCE.items() if k != "random_seed"}
    with pytest.raises(ValueError, match="random_seed"):
        insert_scenario(
            "s-prov-bad",
            _PARAMS,
            results={"impact_summary": b"{}"},
            provenance=incomplete,
        )


def test_insert_none_provenance_field_raises(tmp_db: Path) -> None:
    bad = {**_FULL_PROVENANCE, "app_version": None}
    with pytest.raises(ValueError, match="app_version"):
        insert_scenario(
            "s-prov-bad-2",
            _PARAMS,
            results={"impact_summary": b"{}"},
            provenance=bad,
        )
