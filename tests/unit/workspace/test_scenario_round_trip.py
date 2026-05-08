"""Round-trip tests for the DuckDB scenario store.

The store is the sole writer to ``scenarios``, ``scenario_results`` and
``snapshots``. A mistake here corrupts the workspace for real users, so the
test suite exercises insert → list → read → update → delete end-to-end on
an isolated DB file.
"""

from __future__ import annotations

import os
from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    delete_scenario,
    get_scenario,
    insert_scenario,
    list_scenarios,
    read_result_blobs,
    run_migrations,
    update_scenario_metadata,
)


@pytest.fixture
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the connection factory at an ephemeral DB, migrated to head."""
    db_path = tmp_path / "workspace.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db_path))
    conn = duckdb.connect(str(db_path))
    try:
        run_migrations(conn, migrations_dir=MIGRATIONS_DIR)
    finally:
        conn.close()
    return db_path


def _params() -> dict:
    return {
        "country": "Egypt",
        "hazard_type": "flood",
        "scenario": "rcp85",
        "exposure_type": "crops",
        "asset_type": "economic",
        "ref_year": 2024,
        "future_year": 2050,
        "annual_growth": 2.0,
        "is_era": True,
        "app_option": "era",
    }


def _provenance() -> dict:
    return {
        "app_version": "2.0.0-dev",
        "engine_version": "2.0.0-dev",
        "climada_version": "4.1.1",
        "entity_data_sha256": "a" * 64,
        "hazard_data_sha256": "b" * 64,
        "country_config_sha256": "c" * 64,
        "config_version": "1",
        "random_seed": 42,
    }


def test_insert_and_list_scenarios(tmp_db: Path) -> None:
    insert_scenario(
        "s-1",
        _params(),
        results={"impact_summary": b"{}"},
        provenance=_provenance(),
        name="Egypt flood run",
        tags="flood,egypt",
        notes="first save",
    )

    assert list_scenarios() == []

    update_scenario_metadata("s-1", name="Egypt flood run", tags="flood,egypt", notes="first save")

    rows = list_scenarios()
    assert len(rows) == 1
    assert rows[0].id == "s-1"
    assert rows[0].name == "Egypt flood run"
    assert rows[0].tags == "flood,egypt"
    assert rows[0].notes == "first save"
    assert rows[0].country == "Egypt"
    assert rows[0].hazard_type == "flood"
    assert rows[0].status == "completed"
    assert rows[0].saved is True


def test_unsaved_row_excluded_from_list_but_visible_via_get(tmp_db: Path) -> None:
    # Splits visibility (workspace list) from persistence (single-row
    # fetch): the active analysis tab and PDF export still need to read
    # result blobs from rows the user dismissed without saving.
    insert_scenario(
        "s-unsaved",
        _params(),
        results={"impact_summary": b"{}"},
        provenance=_provenance(),
    )

    assert list_scenarios() == []

    detail = get_scenario("s-unsaved")
    assert detail is not None
    assert detail.scenario.id == "s-unsaved"
    assert detail.scenario.saved is False


def test_insert_and_get_returns_results(tmp_db: Path) -> None:
    insert_scenario(
        "s-2",
        _params(),
        results={
            "impact_summary": b'{"country_name":"egypt"}',
            "waterfall_data": b'{"rows":[]}',
        },
        provenance=_provenance(),
    )

    detail = get_scenario("s-2")
    assert detail is not None
    assert detail.scenario.id == "s-2"
    assert detail.results["impact_summary"] == '{"country_name":"egypt"}'
    assert detail.results["waterfall_data"] == '{"rows":[]}'


def test_unknown_result_type_is_rejected(tmp_db: Path) -> None:
    with pytest.raises(ValueError, match="Unknown result_type"):
        insert_scenario(
            "s-bad",
            _params(),
            results={"not_a_real_type": b"{}"},
            provenance=_provenance(),
        )


def test_update_scenario_metadata_roundtrip(tmp_db: Path) -> None:
    insert_scenario(
        "s-3",
        _params(),
        results={"impact_summary": b"{}"},
        provenance=_provenance(),
    )

    updated = update_scenario_metadata("s-3", name="renamed", tags="a,b", notes="new")
    assert updated is not None
    assert updated.name == "renamed"
    assert updated.tags == "a,b"
    assert updated.notes == "new"
    assert updated.saved is True

    detail = get_scenario("s-3")
    assert detail is not None
    assert detail.scenario.name == "renamed"
    assert detail.scenario.saved is True


def test_update_unknown_id_returns_false(tmp_db: Path) -> None:
    assert update_scenario_metadata("nope", name="x", tags=None, notes=None) is None


def test_delete_scenario_removes_child_rows(tmp_db: Path) -> None:
    insert_scenario(
        "s-4",
        _params(),
        results={"impact_summary": b"{}", "hazard_geojson": b"{}"},
        provenance=_provenance(),
    )

    # Seed a snapshot row so we can verify cascading deletes exercise both
    # child tables the workspace owns.
    conn = duckdb.connect(os.environ[DB_PATH_ENV_VAR])
    try:
        conn.execute(
            "INSERT INTO snapshots (id, scenario_id, snapshot_type) VALUES (?, ?, ?)",
            ["snap-1", "s-4", "hazard_map"],
        )
    finally:
        conn.close()

    removed = delete_scenario("s-4")
    assert removed is True

    assert get_scenario("s-4") is None
    conn = duckdb.connect(os.environ[DB_PATH_ENV_VAR])
    try:
        remaining_results = conn.execute(
            "SELECT COUNT(*) FROM scenario_results WHERE scenario_id = ?", ["s-4"]
        ).fetchone()
        remaining_snapshots = conn.execute(
            "SELECT COUNT(*) FROM snapshots WHERE scenario_id = ?", ["s-4"]
        ).fetchone()
    finally:
        conn.close()
    assert remaining_results is not None and remaining_results[0] == 0
    assert remaining_snapshots is not None and remaining_snapshots[0] == 0


def test_delete_unknown_id_returns_false(tmp_db: Path) -> None:
    assert delete_scenario("nope") is False


def test_read_result_blobs_skips_missing_files(tmp_path: Path) -> None:
    # Only write a subset of the expected artifacts — the helper must
    # silently skip the ones that don't exist so historical runs (no
    # cost-benefit JSON) still persist cleanly.
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    (temp_dir / "hazards_geodata.json").write_bytes(b'{"hazard":1}')
    (temp_dir / "exposures_geodata.json").write_bytes(b'{"exp":1}')

    blobs = read_result_blobs(temp_dir)

    assert set(blobs.keys()) == {"hazard_geojson", "exposure_geojson"}
    assert blobs["hazard_geojson"] == b'{"hazard":1}'
