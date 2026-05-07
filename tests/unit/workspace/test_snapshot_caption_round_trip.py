"""Bundle round-trip for snapshot captions (#303)."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    create_snapshot,
    insert_scenario,
    list_snapshots,
    run_migrations,
)
from backend.export_handler import (
    SNAPSHOTS_MANIFEST,
    export_scenario,
    import_scenario,
)


def _migrate(db_path: Path) -> None:
    conn = duckdb.connect(str(db_path))
    try:
        run_migrations(conn, migrations_dir=MIGRATIONS_DIR)
    finally:
        conn.close()


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


def _params() -> dict:
    return {
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


@pytest.fixture
def source_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db = tmp_path / "src.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db))
    _migrate(db)
    insert_scenario(
        "scen-x",
        _params(),
        results={"impact_summary": json.dumps({"aal": 1.0}).encode("utf-8")},
        provenance=_provenance(),
        name="Captioned export",
        saved=True,
    )
    create_snapshot(
        scenario_id="scen-x",
        snapshot_type="map",
        image=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32,
        caption="Cairo close-up",
    )
    return db


def test_caption_round_trips_via_bundle(
    source_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    zip_path = tmp_path / "out.riskwise-scenario"
    export_scenario("scen-x", zip_path)

    # Manifest sidecar carries the caption.
    import zipfile

    with zipfile.ZipFile(zip_path) as zf:
        assert SNAPSHOTS_MANIFEST in set(zf.namelist())
        manifest = json.loads(zf.read(SNAPSHOTS_MANIFEST))
    assert manifest["snapshots"][0]["caption"] == "Cairo close-up"
    assert manifest["snapshots"][0]["snapshot_type"] == "map"

    # Importing into a fresh DB recreates the caption alongside the image.
    dest = tmp_path / "dest.db"
    _migrate(dest)
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(dest))

    result = import_scenario(zip_path)
    snaps = list_snapshots(result["scenario_id"])
    assert len(snaps) == 1
    assert snaps[0].caption == "Cairo close-up"
    assert snaps[0].snapshot_type == "map"


def test_legacy_bundle_without_manifest_imports_with_null_caption(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Synthesize a pre-#303 archive: provenance + a single PNG, no manifest.
    import zipfile

    zip_path = tmp_path / "legacy.riskwise-scenario"
    provenance = {
        "app_version": "2.0.0-dev",
        "engine_version": "2.0.0-dev",
        "climada_version": "4.1.1",
        "entity_data_sha256": "a" * 64,
        "hazard_data_sha256": "b" * 64,
        "country_config_sha256": "c" * 64,
        "random_seed": 42,
        "computed_at": "2025-01-01T00:00:00",
        "country": "Egypt",
        "hazard": "flood",
        "scenario_type": "rcp85",
    }
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("provenance.json", json.dumps(provenance))
        zf.writestr("results/impact_summary.json", b'{"aal": 0}')
        zf.writestr("snapshots/snap-legacy.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)

    dest = tmp_path / "dest.db"
    _migrate(dest)
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(dest))

    result = import_scenario(zip_path)
    snaps = list_snapshots(result["scenario_id"])
    assert len(snaps) == 1
    assert snaps[0].caption is None
