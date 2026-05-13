"""DuckDB connection factory and DB path resolution."""

from __future__ import annotations

import os
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from backend.logging_config import get_logger

DB_FILE_NAME = "riskwise.db"
DB_PATH_ENV_VAR = "RISKWISE_DB_PATH"
_APP_DIR_NAME = "RISK WISE"

_log = get_logger("db.connection")

# DuckDB rejects a second ``duckdb.connect`` to the same file from the same
# Python process — concurrent FastAPI handlers (e.g. parallel
# ``GET /snapshots/<id>/image`` during PDF export) otherwise race and crash
# with "Unique file handle conflict" or "Can't open a connection ... with a
# different configuration". We cache one underlying connection per resolved
# path and hand callers cheap cursor duplicates; ``cursor.close()`` releases
# only the cursor's state, not the cached file handle.
_shared_connections: dict[str, duckdb.DuckDBPyConnection] = {}
_shared_connections_lock = threading.Lock()


def resolve_db_path() -> Path:
    """Return the absolute path to the DuckDB file for the current process.

    Resolution order:

    1. :data:`DB_PATH_ENV_VAR` (tests) — treated as the full file path so a
       ``tmp_path`` fixture can point at an isolated file.
    2. ``RISKWISE_USER_DATA`` (Electron production) — the userData root
       Electron propagates for logs, exposures, and reports. Using it here
       keeps the DB next to the rest of persistent state.
    3. Platform default — ``%APPDATA%/RISK WISE/`` on Windows,
       ``~/.local/share/RISK WISE/`` on POSIX (matches the issue #48 spec
       for standalone Python invocations that bypass Electron).
    """
    override = os.environ.get(DB_PATH_ENV_VAR)
    if override:
        return Path(override).expanduser().resolve()

    user_data = os.environ.get("RISKWISE_USER_DATA")
    if user_data:
        return (Path(user_data) / DB_FILE_NAME).resolve()

    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return (Path(base) / _APP_DIR_NAME / DB_FILE_NAME).resolve()


def get_connection(path: Path | str | None = None) -> duckdb.DuckDBPyConnection:
    """Return a cursor on the process-wide DuckDB connection for the path.

    See module-level comment for why this returns a cursor rather than a
    fresh ``duckdb.connect`` each time. Callers can ``execute``, ``close``,
    etc. on the returned object exactly as before — DuckDB's ``cursor()``
    returns a ``DuckDBPyConnection`` that shares the underlying state.
    Creates the parent directory on demand.
    """
    db_path = Path(path) if path is not None else resolve_db_path()
    key = str(db_path.resolve())
    with _shared_connections_lock:
        conn = _shared_connections.get(key)
        if conn is None:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = _connect_with_wal_recovery(key)
            _shared_connections[key] = conn
    return conn.cursor()


def _connect_with_wal_recovery(key: str) -> duckdb.DuckDBPyConnection:
    """Open the DB, quarantining an unreplayable WAL and retrying on failure.

    DuckDB can abort with ``INTERNAL Error: Failure while replaying WAL file``
    when the WAL contains ATTACH ops whose target path no longer exists (e.g.
    a workspace-import temp DB that was deleted before the WAL was
    checkpointed). The committed pages in the main DB file are unaffected,
    but the uncheckpointed writes in the WAL cannot be recovered. We rename
    the WAL aside with a timestamp so the next ``connect`` succeeds, and log
    loudly so the event is visible in production.
    """
    try:
        return duckdb.connect(key)
    except duckdb.InternalException as exc:
        if "replaying WAL" not in str(exc):
            raise
        wal_path = Path(key + ".wal")
        if not wal_path.is_file():
            raise
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        quarantine = wal_path.with_name(f"{wal_path.name}.unreplayable.{stamp}")
        wal_path.rename(quarantine)
        _log.error(
            "db.wal.unreplayable_quarantined",
            db_path=key,
            quarantined_to=str(quarantine),
            error=str(exc),
        )
        return duckdb.connect(key)


def close_all_connections() -> None:
    """Close every cached connection. Useful for test teardown and shutdown."""
    with _shared_connections_lock:
        for conn in _shared_connections.values():
            try:
                conn.close()
            except Exception:
                pass
        _shared_connections.clear()
