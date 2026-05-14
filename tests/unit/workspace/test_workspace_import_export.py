"""Round-trip tests for the workspace ZIP import/export (issue #82).

Exercises the full cycle: seed DB → export → fresh DB → import → assert
counts match. Exercises the merge-skip path (re-import into a DB that
already has those scenarios) and the malformed-archive failure modes.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    insert_scenario,
    list_scenarios,
    run_migrations,
)
from backend.workspace_handler import (
    MANIFEST_FILENAME,
    WORKSPACE_EXPORT_VERSION,
    WorkspaceImportError,
    export_workspace,
    import_workspace,
)


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


def _migrate(db_path: Path) -> None:
    conn = duckdb.connect(str(db_path))
    try:
        run_migrations(conn, migrations_dir=MIGRATIONS_DIR)
    finally:
        conn.close()


@pytest.fixture
def seeded_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Migrated DB with two saved scenarios — the export-source fixture."""
    db_path = tmp_path / "source.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db_path))
    _migrate(db_path)
    # ``saved=True`` so the round-trip assertions, which go through
    # ``list_scenarios``, can see the rows — that helper hides unsaved.
    insert_scenario(
        "s-1",
        _params(),
        results={"impact_summary": b'{"ok":1}'},
        provenance=_provenance(),
        name="Egypt flood",
        saved=True,
    )
    insert_scenario(
        "s-2",
        _params(),
        results={"impact_summary": b'{"ok":2}'},
        provenance=_provenance(),
        name="Egypt flood 2",
        saved=True,
    )
    return db_path


@pytest.fixture
def empty_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "empty.db"
    _migrate(db_path)
    return db_path


def test_export_import_round_trip(
    seeded_db: Path, empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Export against the seeded DB
    zip_path = tmp_path / "bundle.riskwise-workspace"
    manifest = export_workspace(zip_path)
    assert manifest["scenario_count"] == 2
    assert manifest["version"] == WORKSPACE_EXPORT_VERSION

    # Validate archive contents
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        assert MANIFEST_FILENAME in names
        assert "riskwise.db" in names
        manifest_data = json.loads(zf.read(MANIFEST_FILENAME))
        assert manifest_data["scenario_count"] == 2

    # Point the connection factory at the empty DB and import
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    counts = import_workspace(zip_path)
    assert counts == {"imported_count": 2, "skipped_count": 0}

    rows = list_scenarios()
    assert {r.id for r in rows} == {"s-1", "s-2"}


def test_import_skips_existing_ids(
    seeded_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    zip_path = tmp_path / "bundle.riskwise-workspace"
    export_workspace(zip_path)

    # Re-import into the same DB: both ids already present → skipped.
    counts = import_workspace(zip_path)
    assert counts == {"imported_count": 0, "skipped_count": 2}
    assert len(list_scenarios()) == 2


def test_import_missing_manifest_raises(
    empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    bad = tmp_path / "bad.riskwise-workspace"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("riskwise.db", b"x")
    with pytest.raises(WorkspaceImportError, match="manifest"):
        import_workspace(bad)


def test_import_missing_db_raises(
    empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    bad = tmp_path / "bad.riskwise-workspace"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr(MANIFEST_FILENAME, json.dumps({"version": WORKSPACE_EXPORT_VERSION}))
    with pytest.raises(WorkspaceImportError, match="riskwise.db"):
        import_workspace(bad)


def test_import_wrong_version_raises(
    empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    bad = tmp_path / "bad.riskwise-workspace"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr(MANIFEST_FILENAME, json.dumps({"version": 999, "schema_version": 1}))
        zf.writestr("riskwise.db", b"x")
    with pytest.raises(WorkspaceImportError, match="version"):
        import_workspace(bad)


def test_import_schema_mismatch_raises(
    empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    bad = tmp_path / "bad.riskwise-workspace"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr(
            MANIFEST_FILENAME,
            json.dumps({"version": WORKSPACE_EXPORT_VERSION, "schema_version": 999}),
        )
        zf.writestr("riskwise.db", b"x")
    with pytest.raises(WorkspaceImportError, match="schema"):
        import_workspace(bad)


def test_import_not_a_zip_raises(
    empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
    bad = tmp_path / "bad.riskwise-workspace"
    bad.write_bytes(b"not a zip file")
    with pytest.raises(WorkspaceImportError, match="ZIP"):
        import_workspace(bad)
