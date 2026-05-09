"""Forward-only migration runner for the DuckDB scenario store.

The runner is the only writer to ``schema_version``; SQL files under
:data:`MIGRATIONS_DIR` are pure DDL. Each applied migration appends one
row (``version``, ``applied_at``) so existing audit data is never
rewritten when a new migration lands. A DB ahead of the on-disk
migrations is refused rather than silently rolled back — that state
indicates a downgrade and destroying user data is not an option.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import duckdb

from backend.logging_config import get_logger

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

_MIGRATION_FILENAME_RE = re.compile(r"^(\d{4})_[A-Za-z0-9_]+\.sql$")

# Migrations may opt out of the runner's BEGIN/COMMIT wrap by including this
# directive on a comment line in the file header. Required for migrations
# that combine DELETE with ALTER TABLE DROP/ADD COLUMN on Windows: DuckDB
# 1.5.2 crashes the process with STATUS_STACK_BUFFER_OVERRUN (0xC0000409)
# at COMMIT in that combination, even though every statement succeeds.
_NO_TRANSACTION_DIRECTIVE = "@no-transaction"

_log = get_logger("db.migrations")


class MigrationError(RuntimeError):
    """Raised when the runner refuses to proceed (downgrade, bad file, failed SQL)."""


@dataclass(frozen=True)
class _Migration:
    version: int
    path: Path

    @property
    def name(self) -> str:
        return self.path.name


def run_startup_migrations() -> None:
    """Resolve the production DB path, open a connection, and run migrations.

    Intended as the FastAPI lifespan entry point. Any failure propagates —
    a half-migrated DB is the worst possible state to serve requests from.
    """
    from backend.db.connection import get_connection, resolve_db_path

    db_path = resolve_db_path()
    _log.info("db.migrations.startup", db_path=str(db_path))
    conn = get_connection(db_path)
    try:
        run_migrations(conn)
    finally:
        conn.close()


def run_migrations(
    conn: duckdb.DuckDBPyConnection,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> None:
    """Apply every pending migration from ``migrations_dir`` in order."""
    _ensure_schema_version_table(conn)
    current = _current_version(conn)
    available = _discover_migrations(migrations_dir)

    if not available and current == 0:
        _log.info("db.migrations.empty")
        return

    max_available = available[-1].version if available else 0
    if current > max_available:
        _log.error(
            "db.migrations.downgrade_blocked",
            current_version=current,
            max_available=max_available,
        )
        raise MigrationError(
            f"Database is at schema version {current} but the highest migration "
            f"on disk is {max_available}. Refusing to downgrade."
        )

    pending = [m for m in available if m.version > current]
    if not pending:
        _log.info("db.migrations.up_to_date", current_version=current)
        return

    for migration in pending:
        _apply_migration(conn, migration)


def _ensure_schema_version_table(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _current_version(conn: duckdb.DuckDBPyConnection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_version").fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _discover_migrations(migrations_dir: Path) -> list[_Migration]:
    if not migrations_dir.is_dir():
        return []
    found: list[_Migration] = []
    for entry in sorted(migrations_dir.iterdir()):
        if not entry.is_file():
            continue
        match = _MIGRATION_FILENAME_RE.match(entry.name)
        if not match:
            continue
        found.append(_Migration(version=int(match.group(1)), path=entry))
    found.sort(key=lambda m: m.version)
    _check_unique_versions(found)
    return found


def _check_unique_versions(migrations: list[_Migration]) -> None:
    seen: dict[int, Path] = {}
    for migration in migrations:
        if migration.version in seen:
            raise MigrationError(
                f"Duplicate migration version {migration.version}: "
                f"{seen[migration.version].name} and {migration.name}"
            )
        seen[migration.version] = migration.path


def _apply_migration(conn: duckdb.DuckDBPyConnection, migration: _Migration) -> None:
    sql = migration.path.read_text(encoding="utf-8")
    transactional = _NO_TRANSACTION_DIRECTIVE not in sql
    _log.info(
        "db.migrations.applying",
        version=migration.version,
        file=migration.name,
        transactional=transactional,
    )
    if transactional:
        conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(sql)
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (?)",
            [migration.version],
        )
        if transactional:
            conn.execute("COMMIT")
    except (duckdb.Error, OSError) as exc:
        if transactional:
            conn.execute("ROLLBACK")
        _log.error(
            "db.migrations.failed",
            version=migration.version,
            file=migration.name,
            error=str(exc),
        )
        raise MigrationError(f"Migration {migration.name} failed: {exc}") from exc
    _log.info("db.migrations.applied", version=migration.version, file=migration.name)
