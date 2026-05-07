"""Round-trip + provenance tests for the .riskwise-scenario export.

Exercises the full cycle: seed DB → export → fresh DB → import → assert
the imported row carries the same provenance and is_imported=True. Plus
negative-path coverage for malformed archives.

# TODO(area-20-cross-platform): wire non-blocking tolerance test here once
# the cross-platform CI job lands.
"""

from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    get_scenario,
    insert_scenario,
    list_scenarios,
    run_migrations,
)
from backend.export_handler import (
    PROVENANCE_FILENAME,
    README_FILENAME,
    RESULTS_DIR,
    SCENARIO_ARCHIVE_SUFFIX,
    SNAPSHOTS_DIR,
    ScenarioImportError,
    build_export_to_temp,
    export_scenario,
    import_scenario,
    safe_filename,
)


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
    db_path = tmp_path / "source.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db_path))
    _migrate(db_path)
    insert_scenario(
        "scen-1",
        _params(),
        results={
            "impact_summary": json.dumps({"aal": 1234.5}).encode("utf-8"),
            "waterfall_data": json.dumps({"categories": []}).encode("utf-8"),
        },
        provenance=_provenance(),
        name="Egypt flood baseline",
    )
    # Inject a snapshot row directly so the export bundles snapshots/
    conn = duckdb.connect(str(db_path))
    try:
        conn.execute(
            """
            INSERT INTO snapshots (id, scenario_id, snapshot_type, image, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                "snap-1",
                "scen-1",
                "waterfall_chart",
                b"\x89PNG\r\n\x1a\nfake-image-bytes",
                datetime.now(UTC),
            ],
        )
    finally:
        conn.close()
    return db_path


@pytest.fixture
def empty_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "dest.db"
    _migrate(db_path)
    return db_path


class TestExportArchiveLayout:
    def test_archive_contains_required_entries(self, seeded_db: Path, tmp_path: Path) -> None:
        zip_path = tmp_path / "out.riskwise-scenario"
        provenance = export_scenario("scen-1", zip_path)

        assert zip_path.is_file()
        with zipfile.ZipFile(zip_path) as zf:
            names = set(zf.namelist())
            assert PROVENANCE_FILENAME in names
            assert README_FILENAME in names
            result_entries = sorted(n for n in names if n.startswith(f"{RESULTS_DIR}/"))
            assert result_entries == [
                f"{RESULTS_DIR}/impact_summary.json",
                f"{RESULTS_DIR}/waterfall_data.json",
            ]
            snap_pngs = [
                n for n in names if n.startswith(f"{SNAPSHOTS_DIR}/") and n.endswith(".png")
            ]
            assert snap_pngs == [f"{SNAPSHOTS_DIR}/snap-1.png"]
            assert zf.read(f"{SNAPSHOTS_DIR}/snap-1.png").startswith(b"\x89PNG")

        # provenance.json field shape matches the issue's spec exactly.
        assert provenance["app_version"] == "2.0.0-dev"
        assert provenance["climada_version"] == "4.1.1"
        assert provenance["random_seed"] == 42
        assert provenance["country"] == "Egypt"
        assert provenance["hazard"] == "flood"  # NOT 'hazard_type'
        assert provenance["scenario_type"] == "rcp85"  # NOT 'scenario'
        assert provenance["entity_data_sha256"] == "a" * 64
        assert provenance["computed_at"] is not None

    def test_result_blobs_round_trip_as_json_files(self, seeded_db: Path, tmp_path: Path) -> None:
        zip_path = tmp_path / "out.riskwise-scenario"
        export_scenario("scen-1", zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            impact = json.loads(zf.read(f"{RESULTS_DIR}/impact_summary.json"))
            waterfall = json.loads(zf.read(f"{RESULTS_DIR}/waterfall_data.json"))
        assert impact == {"aal": 1234.5}
        assert waterfall == {"categories": []}

    def test_readme_includes_reproducibility_note(self, seeded_db: Path, tmp_path: Path) -> None:
        zip_path = tmp_path / "out.riskwise-scenario"
        export_scenario("scen-1", zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            readme = zf.read(README_FILENAME).decode("utf-8")
        assert "Egypt flood baseline" in readme
        assert "Random seed: 42" in readme
        assert "read-only on import" in readme


class TestBuildExportToTemp:
    def test_uses_safe_filename_from_scenario_name(self, seeded_db: Path) -> None:
        output, filename = build_export_to_temp("scen-1")
        try:
            assert filename.endswith(SCENARIO_ARCHIVE_SUFFIX)
            # Spaces collapsed to underscore so the OS picker is happy.
            assert "Egypt_flood_baseline" in filename
            assert output.is_file()
        finally:
            output.unlink(missing_ok=True)
            output.parent.rmdir()


class TestRoundTripImport:
    def test_import_inserts_read_only_row(
        self, seeded_db: Path, empty_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        zip_path = tmp_path / "out.riskwise-scenario"
        export_scenario("scen-1", zip_path)

        monkeypatch.setenv(DB_PATH_ENV_VAR, str(empty_db))
        result = import_scenario(zip_path)
        new_id = result["scenario_id"]
        assert result["name"] in {"Egypt flood baseline", "out"}

        rows = list_scenarios()
        assert len(rows) == 1
        imported = rows[0]
        assert imported.id == new_id
        assert imported.is_imported is True
        # Provenance fields propagated through the wire format and back.
        assert imported.app_version == "2.0.0-dev"
        assert imported.climada_version == "4.1.1"
        assert imported.entity_data_sha256 == "a" * 64
        assert imported.random_seed == 42
        # Original parameters survived the round-trip.
        assert imported.country == "Egypt"
        assert imported.hazard_type == "flood"
        assert imported.scenario == "rcp85"

        # Snapshot bytes carried over and stored as a BLOB row.
        conn = duckdb.connect(str(empty_db))
        try:
            row = conn.execute(
                "SELECT image FROM snapshots WHERE scenario_id = ?", [new_id]
            ).fetchone()
        finally:
            conn.close()
        assert row is not None
        assert bytes(row[0]).startswith(b"\x89PNG")

        # Result blobs round-tripped — load via get_scenario which reads from DB.
        detail = get_scenario(new_id)
        assert detail is not None
        assert "impact_summary" in detail.results
        assert json.loads(detail.results["impact_summary"]) == {"aal": 1234.5}


class TestImportFailureModes:
    def test_missing_provenance_raises(self, empty_db: Path, tmp_path: Path) -> None:
        bad = tmp_path / "bad.riskwise-scenario"
        with zipfile.ZipFile(bad, "w") as zf:
            zf.writestr(f"{RESULTS_DIR}/impact_summary.json", b"{}")
        with pytest.raises(ScenarioImportError, match=PROVENANCE_FILENAME):
            import_scenario(bad)

    def test_missing_results_dir_raises(self, empty_db: Path, tmp_path: Path) -> None:
        bad = tmp_path / "bad.riskwise-scenario"
        with zipfile.ZipFile(bad, "w") as zf:
            zf.writestr(PROVENANCE_FILENAME, json.dumps({}))
        with pytest.raises(ScenarioImportError, match=RESULTS_DIR):
            import_scenario(bad)

    def test_provenance_missing_required_fields_raises(
        self, empty_db: Path, tmp_path: Path
    ) -> None:
        bad = tmp_path / "bad.riskwise-scenario"
        with zipfile.ZipFile(bad, "w") as zf:
            zf.writestr(PROVENANCE_FILENAME, json.dumps({"app_version": "x"}))
            zf.writestr(f"{RESULTS_DIR}/impact_summary.json", b"{}")
        with pytest.raises(ScenarioImportError, match="missing fields"):
            import_scenario(bad)

    def test_provenance_not_json_raises(self, empty_db: Path, tmp_path: Path) -> None:
        bad = tmp_path / "bad.riskwise-scenario"
        with zipfile.ZipFile(bad, "w") as zf:
            zf.writestr(PROVENANCE_FILENAME, b"not-json{")
            zf.writestr(f"{RESULTS_DIR}/impact_summary.json", b"{}")
        with pytest.raises(ScenarioImportError, match="not valid JSON"):
            import_scenario(bad)

    def test_not_a_zip_raises(self, empty_db: Path, tmp_path: Path) -> None:
        bad = tmp_path / "bad.riskwise-scenario"
        bad.write_bytes(b"plain text, not a zip")
        with pytest.raises(ScenarioImportError, match="ZIP"):
            import_scenario(bad)

    def test_missing_file_raises(self, tmp_path: Path) -> None:
        with pytest.raises(ScenarioImportError, match="not found"):
            import_scenario(tmp_path / "nope.riskwise-scenario")


class TestSafeFilename:
    @pytest.mark.parametrize(
        "name,fallback,expected",
        [
            ("Egypt flood", "id", "Egypt_flood"),
            ("a/b\\c:d", "id", "a_b_c_d"),
            ("", "id-123", "id-123"),
            (None, "id-123", "id-123"),
            ("___", "id-123", "id-123"),
        ],
    )
    def test_collapses_unsafe_chars(self, name: str | None, fallback: str, expected: str) -> None:
        assert safe_filename(name, fallback) == expected
