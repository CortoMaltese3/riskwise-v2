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
