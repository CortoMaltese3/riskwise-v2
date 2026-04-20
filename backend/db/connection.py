"""DuckDB connection factory and DB path resolution."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import duckdb

DB_FILE_NAME = "riskwise.db"
DB_PATH_ENV_VAR = "RISKWISE_DB_PATH"
_APP_DIR_NAME = "RISK WISE"


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
    """Open a DuckDB connection to the resolved (or supplied) DB path.

    Creates the parent directory on demand; callers own the connection.
    """
    db_path = Path(path) if path is not None else resolve_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(db_path))
