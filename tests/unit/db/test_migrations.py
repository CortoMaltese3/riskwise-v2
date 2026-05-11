"""Unit tests for the DuckDB migration runner."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from backend.db.migrations import MIGRATIONS_DIR, MigrationError, run_migrations

EXPECTED_TABLES = {
    "schema_version",
    "scenarios",
    "scenario_results",
    "computation_cache",
    "snapshots",
    "cred_datasets",
    "adaptation_measures",
    "measure_sets",
}


@pytest.fixture
def conn(tmp_path: Path):
    connection = duckdb.connect(str(tmp_path / "test.db"))
    try:
        yield connection
    finally:
        connection.close()


def _table_names(connection: duckdb.DuckDBPyConnection) -> set[str]:
    rows = connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    return {row[0] for row in rows}


def _stage_initial_migration(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    source = MIGRATIONS_DIR / "0001_initial.sql"
    (target_dir / "0001_initial.sql").write_text(
        source.read_text(encoding="utf-8"), encoding="utf-8"
    )


def test_applies_initial_on_empty_db(conn: duckdb.DuckDBPyConnection) -> None:
    run_migrations(conn)

    assert EXPECTED_TABLES.issubset(_table_names(conn))

    rows = conn.execute(
        "SELECT version, applied_at FROM schema_version ORDER BY version"
    ).fetchall()
    # Every on-disk migration lands and is logged exactly once; the first
    # row is ``0001_initial`` and later rows are whatever follow-on
    # migrations exist (e.g. ``0002_provenance``).
    assert [row[0] for row in rows] == list(range(1, len(rows) + 1))
    assert all(row[1] is not None for row in rows)


def test_rerun_is_idempotent(conn: duckdb.DuckDBPyConnection) -> None:
    run_migrations(conn)
    first_rows = conn.execute(
        "SELECT version, applied_at FROM schema_version ORDER BY version"
    ).fetchall()

    run_migrations(conn)

    rows = conn.execute(
        "SELECT version, applied_at FROM schema_version ORDER BY version"
    ).fetchall()
    # No duplicates, and the original applied_at timestamps are preserved.
    assert rows == first_rows


def test_rejects_unknown_future_version(conn: duckdb.DuckDBPyConnection, tmp_path: Path) -> None:
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_noop.sql").write_text(
        "CREATE TABLE noop (id INTEGER);", encoding="utf-8"
    )

    conn.execute(
        """
        CREATE TABLE schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute("INSERT INTO schema_version (version) VALUES (5)")

    with pytest.raises(MigrationError, match="Refusing to downgrade"):
        run_migrations(conn, migrations_dir=migrations_dir)


def test_chained_migration_preserves_existing_row(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    migrations_dir = tmp_path / "migrations"
    _stage_initial_migration(migrations_dir)

    run_migrations(conn, migrations_dir=migrations_dir)

    conn.execute(
        """
        INSERT INTO scenarios (id, name, country, hazard_type, ref_year)
        VALUES (?, ?, ?, ?, ?)
        """,
        ["s1", "baseline", "EGY", "flood", 2020],
    )

    (migrations_dir / "0002_demo.sql").write_text(
        "ALTER TABLE scenarios ADD COLUMN demo_flag BOOLEAN;",
        encoding="utf-8",
    )

    run_migrations(conn, migrations_dir=migrations_dir)

    row = conn.execute(
        "SELECT id, name, country, hazard_type, ref_year, demo_flag FROM scenarios"
    ).fetchone()
    assert row == ("s1", "baseline", "EGY", "flood", 2020, None)

    versions = [
        v for (v,) in conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall()
    ]
    assert versions == [1, 2]


def test_stray_file_in_migrations_dir_is_ignored(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_ok.sql").write_text("CREATE TABLE t (x INTEGER);", encoding="utf-8")
    (migrations_dir / "README.md").write_text("not a migration", encoding="utf-8")
    (migrations_dir / "0001_ok.sql.swp").write_text("editor junk", encoding="utf-8")

    run_migrations(conn, migrations_dir=migrations_dir)

    assert "t" in _table_names(conn)


def test_duplicate_version_is_rejected(conn: duckdb.DuckDBPyConnection, tmp_path: Path) -> None:
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_a.sql").write_text("CREATE TABLE a (x INTEGER);", encoding="utf-8")
    (migrations_dir / "0001_b.sql").write_text("CREATE TABLE b (x INTEGER);", encoding="utf-8")

    with pytest.raises(MigrationError, match="Duplicate migration version"):
        run_migrations(conn, migrations_dir=migrations_dir)


def test_no_transaction_directive_skips_transaction_wrap(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    # A migration with `-- @no-transaction` runs each statement in autocommit,
    # so a later failing statement leaves earlier ones applied. This is the
    # opt-out used by 0010_exposure_unify.sql to dodge a DuckDB-on-Windows
    # crash when DELETE + ALTER TABLE share one transaction.
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_init.sql").write_text("CREATE TABLE t (x INTEGER);", encoding="utf-8")
    (migrations_dir / "0002_split.sql").write_text(
        "-- @no-transaction\n"
        "INSERT INTO t (x) VALUES (1);\n"
        "INSERT INTO t (x) VALUES ('not-an-int');\n",
        encoding="utf-8",
    )

    with pytest.raises(MigrationError):
        run_migrations(conn, migrations_dir=migrations_dir)

    # First insert committed in autocommit; second failed and was not wrapped
    # in a rollback, so it stays visible.
    rows = [r[0] for r in conn.execute("SELECT x FROM t ORDER BY x").fetchall()]
    assert rows == [1]
    versions = [
        v for (v,) in conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall()
    ]
    assert versions == [1]


def test_transactional_migration_rolls_back_on_failure(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    # The default (no directive) keeps BEGIN/COMMIT semantics: a failing
    # statement rolls back any earlier writes in the same migration.
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_init.sql").write_text("CREATE TABLE t (x INTEGER);", encoding="utf-8")
    (migrations_dir / "0002_split.sql").write_text(
        "INSERT INTO t (x) VALUES (1);\nINSERT INTO t (x) VALUES ('not-an-int');\n",
        encoding="utf-8",
    )

    with pytest.raises(MigrationError):
        run_migrations(conn, migrations_dir=migrations_dir)

    rows = conn.execute("SELECT COUNT(*) FROM t").fetchone()
    assert rows is not None and rows[0] == 0


def test_0013_adds_null_surface_to_existing_snapshots(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    # 0013 adds the ``surface`` column to ``snapshots`` (#362). On a DB that
    # already has snapshot rows from a pre-#362 build, the migration must
    # apply cleanly and the existing rows must surface as NULL — explicitly
    # checked here because the issue calls out the "no backfill" contract.
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    pre_0013 = sorted(p for p in MIGRATIONS_DIR.glob("00[01][0-9]_*.sql") if int(p.name[:4]) < 13)
    assert pre_0013, "expected at least one pre-0013 migration on disk"
    for src in pre_0013:
        (migrations_dir / src.name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    run_migrations(conn, migrations_dir=migrations_dir)

    conn.execute(
        """
        INSERT INTO scenarios (id, name, country, hazard_type, ref_year, app_version,
            entity_data_sha256, hazard_data_sha256, country_config_sha256,
            config_version, random_seed, saved)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "scen-pre-13",
            "pre-surface scenario",
            "EGY",
            "flood",
            2024,
            "1.0.0",
            "a" * 64,
            "b" * 64,
            "c" * 64,
            "1",
            42,
            True,
        ],
    )
    # Insert a snapshot row using only the pre-0013 columns. After 0013
    # runs, the new ``surface`` column must default to NULL for this row.
    conn.execute(
        """
        INSERT INTO snapshots (id, scenario_id, snapshot_type, image, title, caption)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ["snap-pre-13", "scen-pre-13", "map", b"\x89PNG", None, "legacy caption"],
    )

    src_0013 = MIGRATIONS_DIR / "0013_snapshot_surface.sql"
    (migrations_dir / src_0013.name).write_text(
        src_0013.read_text(encoding="utf-8"), encoding="utf-8"
    )

    run_migrations(conn, migrations_dir=migrations_dir)

    row = conn.execute(
        "SELECT id, surface, caption FROM snapshots WHERE id = 'snap-pre-13'"
    ).fetchone()
    assert row is not None
    assert row[0] == "snap-pre-13"
    assert row[1] is None
    # Other columns must round-trip untouched — a regression in 0013 that
    # rebuilt the table without preserving values would be caught here.
    assert row[2] == "legacy caption"


def test_0008_backfills_existing_rows_to_saved_true(
    conn: duckdb.DuckDBPyConnection, tmp_path: Path
) -> None:
    # Stage migrations 0001..0007 only to simulate an upgrade from a
    # pre-``saved``-column build: a row inserted now predates the column.
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    pre_0008 = sorted(p for p in MIGRATIONS_DIR.glob("000[1-7]_*.sql"))
    assert pre_0008, "expected at least one pre-0008 migration on disk"
    for src in pre_0008:
        (migrations_dir / src.name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    run_migrations(conn, migrations_dir=migrations_dir)

    # Bypass ``insert_scenario`` because it now writes to ``saved``,
    # which does not yet exist at this migration level.
    conn.execute(
        """
        INSERT INTO scenarios (id, name, country, hazard_type, ref_year, app_version,
            entity_data_sha256, hazard_data_sha256, country_config_sha256,
            config_version, random_seed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "legacy-1",
            "pre-upgrade scenario",
            "EGY",
            "flood",
            2024,
            "1.0.0",
            "a" * 64,
            "b" * 64,
            "c" * 64,
            "1",
            42,
        ],
    )

    src_0008 = MIGRATIONS_DIR / "0008_saved_flag.sql"
    (migrations_dir / src_0008.name).write_text(
        src_0008.read_text(encoding="utf-8"), encoding="utf-8"
    )

    run_migrations(conn, migrations_dir=migrations_dir)

    saved = conn.execute("SELECT saved FROM scenarios WHERE id = 'legacy-1'").fetchone()
    assert saved is not None
    assert bool(saved[0]) is True

    conn.execute(
        """
        INSERT INTO scenarios (id, name, country, hazard_type, ref_year, app_version,
            entity_data_sha256, hazard_data_sha256, country_config_sha256,
            config_version, random_seed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "fresh-1",
            None,
            "EGY",
            "flood",
            2024,
            "1.0.0",
            "a" * 64,
            "b" * 64,
            "c" * 64,
            "1",
            42,
        ],
    )
    fresh = conn.execute("SELECT saved FROM scenarios WHERE id = 'fresh-1'").fetchone()
    assert fresh is not None
    assert bool(fresh[0]) is False
