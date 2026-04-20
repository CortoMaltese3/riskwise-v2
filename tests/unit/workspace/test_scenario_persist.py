"""Integration test: a finished scenario run writes the expected DB rows.

The scenario runner's pipeline itself is CLIMADA-bound and not feasible to
invoke here. Instead this test exercises the exact glue the runner uses —
``read_result_blobs`` + ``insert_scenario`` — against a real DuckDB file,
mirroring the artifact layout the pipeline leaves in ``DATA_TEMP_DIR`` when
a run succeeds. If these two pieces stay in sync with the runner, the
workspace save path is correct end-to-end.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest
from db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    get_scenario,
    insert_scenario,
    read_result_blobs,
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


def _write_run_artifacts(temp_dir: Path) -> None:
    """Lay down the JSON files the scenario runner produces on success."""
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / "hazards_geodata.json").write_text('{"hazard":"fc"}', encoding="utf-8")
    (temp_dir / "exposures_geodata.json").write_text('{"exp":"fc"}', encoding="utf-8")
    (temp_dir / "risks_geodata.json").write_text('{"imp":"fc"}', encoding="utf-8")
    (temp_dir / "risks_waterfall_data.json").write_text('{"rows":[]}', encoding="utf-8")
    (temp_dir / "cost_benefit_data.json").write_text('{"bars":[]}', encoding="utf-8")


def test_scenario_run_persists_result_blobs(tmp_db: Path, tmp_path: Path) -> None:
    temp_dir = tmp_path / "temp"
    _write_run_artifacts(temp_dir)

    params = {
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
    summary = {**params, "map_title": "Egypt flood 2050"}

    results = read_result_blobs(temp_dir)
    results["impact_summary"] = json.dumps(summary).encode("utf-8")

    insert_scenario("run-1", params, results, name="Egypt flood 2050")

    detail = get_scenario("run-1")
    assert detail is not None
    # All six result blobs the runner can produce are round-tripped.
    assert set(detail.results.keys()) == {
        "hazard_geojson",
        "exposure_geojson",
        "impact_geojson",
        "waterfall_data",
        "costben_data",
        "impact_summary",
    }
    assert json.loads(detail.results["impact_summary"])["map_title"] == "Egypt flood 2050"
    assert detail.scenario.country == "Egypt"
    assert detail.scenario.status == "completed"


def test_scenario_run_without_cost_benefit_still_persists(tmp_db: Path, tmp_path: Path) -> None:
    # Historical runs skip cost-benefit: only the three geojson files land
    # in temp. The insert must succeed and the missing blobs must simply
    # not appear in ``scenario_results``.
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    (temp_dir / "hazards_geodata.json").write_text('{"h":1}', encoding="utf-8")
    (temp_dir / "exposures_geodata.json").write_text('{"e":1}', encoding="utf-8")
    (temp_dir / "risks_geodata.json").write_text('{"i":1}', encoding="utf-8")

    results = read_result_blobs(temp_dir)
    results["impact_summary"] = b'{"map_title":"historical"}'
    params = {
        "country": "Thailand",
        "hazard_type": "flood",
        "scenario": "historical",
        "exposure_economic": "crops",
        "exposure_non_economic": "",
        "ref_year": 2024,
        "future_year": 2024,
        "annual_growth": 0.0,
        "is_era": True,
        "app_option": "era",
    }
    insert_scenario("run-2", params, results, name="Thailand historical")

    detail = get_scenario("run-2")
    assert detail is not None
    assert set(detail.results.keys()) == {
        "hazard_geojson",
        "exposure_geojson",
        "impact_geojson",
        "impact_summary",
    }
