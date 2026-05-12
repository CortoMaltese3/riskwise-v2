"""Tests for ``RunHydrateScenarioTemp``.

The command is the backend half of the Workspace restore flow: it reads
a saved scenario's persisted blobs and writes them back into
``DATA_TEMP_DIR`` so the map and chart components — which fetch from
that directory — paint the right state.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest

from backend.cli import StatusCode
from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    ScenarioNotFound,
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


@pytest.fixture
def tmp_data_temp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect ``DATA_TEMP_DIR`` inside the command + shared fs helper."""
    target = tmp_path / "data_temp"
    target.mkdir()
    import backend.run_hydrate_scenario_temp as mod
    import backend.utils.fs as fs_mod

    monkeypatch.setattr(mod, "DATA_TEMP_DIR", target)
    monkeypatch.setattr(fs_mod, "DATA_TEMP_DIR", target)
    return target


_FIXTURE_PROVENANCE: dict = {
    "app_version": "2.0.0-dev",
    "engine_version": "2.0.0-dev",
    "climada_version": "4.1.1",
    "entity_data_sha256": "a" * 64,
    "hazard_data_sha256": "b" * 64,
    "country_config_sha256": "c" * 64,
    "config_version": "1",
    "random_seed": 1234567890,
}


def _insert_full_scenario(scenario_id: str = "scn-h1") -> dict[str, bytes]:
    """Insert a scenario row with all five file-backed result blobs."""
    blobs = {
        "hazard_geojson": b'{"hazard":"fc"}',
        "exposure_geojson": b'{"exp":"fc"}',
        "impact_geojson": b'{"imp":"fc"}',
        "waterfall_data": b'{"rows":[]}',
        "costben_data": b'{"bars":[]}',
        "impact_summary": json.dumps({"map_title": "Egypt flood 2050"}).encode("utf-8"),
    }
    params = {
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
    insert_scenario(scenario_id, params, blobs, provenance=_FIXTURE_PROVENANCE, name="Egypt run")
    return blobs


def test_happy_path_writes_all_file_backed_blobs(tmp_db: Path, tmp_data_temp: Path) -> None:
    from backend.run_hydrate_scenario_temp import RunHydrateScenarioTemp

    blobs = _insert_full_scenario("scn-happy")

    result = RunHydrateScenarioTemp({"scenario_id": "scn-happy"}).execute()

    assert result["status"]["code"] == StatusCode.SUCCESS
    # ``impact_summary`` is intentionally not a file-backed type; only the
    # five JSON blobs the runner drops on disk are rewritten.
    assert set(result["data"]["written"]) == {
        "hazard_geojson",
        "exposure_geojson",
        "impact_geojson",
        "waterfall_data",
        "costben_data",
    }
    # Byte-identical contents make sure the round-trip preserves the JSON
    # the maps and charts will re-parse on the next fetch.
    assert (tmp_data_temp / "hazards_geodata.json").read_bytes() == blobs["hazard_geojson"]
    assert (tmp_data_temp / "exposures_geodata.json").read_bytes() == blobs["exposure_geojson"]
    assert (tmp_data_temp / "risks_geodata.json").read_bytes() == blobs["impact_geojson"]
    assert (tmp_data_temp / "risks_waterfall_data.json").read_bytes() == blobs["waterfall_data"]
    assert (tmp_data_temp / "cost_benefit_data.json").read_bytes() == blobs["costben_data"]


def test_partial_blobs_skip_missing_files(tmp_db: Path, tmp_data_temp: Path) -> None:
    """Historical scenarios skip cost-benefit. The hydrate must not raise."""
    from backend.run_hydrate_scenario_temp import RunHydrateScenarioTemp

    blobs = {
        "hazard_geojson": b'{"h":1}',
        "exposure_geojson": b'{"e":1}',
        "impact_geojson": b'{"i":1}',
        "impact_summary": b'{"map_title":"historical"}',
    }
    params = {
        "country": "Thailand",
        "hazard_type": "flood",
        "scenario": "historical",
        "exposure_type": "crops",
        "asset_type": "economic",
        "ref_year": 2024,
        "future_year": 2024,
        "annual_growth": 0.0,
        "is_era": True,
        "app_option": "era",
    }
    insert_scenario(
        "scn-historical",
        params,
        blobs,
        provenance=_FIXTURE_PROVENANCE,
        name="Thailand historical",
    )

    result = RunHydrateScenarioTemp({"scenario_id": "scn-historical"}).execute()

    assert result["status"]["code"] == StatusCode.SUCCESS
    assert set(result["data"]["written"]) == {
        "hazard_geojson",
        "exposure_geojson",
        "impact_geojson",
    }
    assert not (tmp_data_temp / "cost_benefit_data.json").exists()
    assert not (tmp_data_temp / "risks_waterfall_data.json").exists()


def test_missing_scenario_id_raises(tmp_db: Path, tmp_data_temp: Path) -> None:
    """Endpoint translates ``ScenarioNotFound`` to HTTP 404."""
    from backend.run_hydrate_scenario_temp import RunHydrateScenarioTemp

    with pytest.raises(ScenarioNotFound):
        RunHydrateScenarioTemp({"scenario_id": "nope"}).execute()
    # Nothing written to the temp dir on the failure path.
    assert list(tmp_data_temp.iterdir()) == []


def test_blank_scenario_id_returns_validation_error(tmp_data_temp: Path) -> None:
    from backend.run_hydrate_scenario_temp import RunHydrateScenarioTemp

    result = RunHydrateScenarioTemp({"scenario_id": ""}).execute()
    assert result["status"]["code"] == StatusCode.VALIDATION_ERROR
    assert result["data"] is None


def test_pre_existing_files_are_cleared_before_writing(tmp_db: Path, tmp_data_temp: Path) -> None:
    """Stale files from a previous run must not bleed into the restored view."""
    from backend.run_hydrate_scenario_temp import RunHydrateScenarioTemp

    sentinel = tmp_data_temp / "stale_from_previous_run.json"
    sentinel.write_text("ghost", encoding="utf-8")
    _insert_full_scenario("scn-cleanup")

    result = RunHydrateScenarioTemp({"scenario_id": "scn-cleanup"}).execute()

    assert result["status"]["code"] == StatusCode.SUCCESS
    assert not sentinel.exists()
