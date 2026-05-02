"""Unit tests for ``db.connection``: path resolution and connection factory."""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pytest

from backend.db.connection import DB_FILE_NAME, DB_PATH_ENV_VAR, get_connection, resolve_db_path


def test_resolves_path_from_env_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    override = tmp_path / "subdir" / "riskwise.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(override))

    resolved = resolve_db_path()

    assert resolved == override.resolve()


def test_resolves_platform_default_when_env_absent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(DB_PATH_ENV_VAR, raising=False)
    if sys.platform == "win32":
        monkeypatch.setenv("APPDATA", str(tmp_path))
    else:
        monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))

    resolved = resolve_db_path()

    assert resolved.name == DB_FILE_NAME
    assert tmp_path.resolve() in resolved.parents


def test_get_connection_creates_parent_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "nested" / "does-not-exist-yet" / "riskwise.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(target))

    conn = get_connection()
    try:
        assert target.parent.exists()
        assert isinstance(conn, duckdb.DuckDBPyConnection)
        # Smoke-check the connection actually talks to DuckDB.
        assert conn.execute("SELECT 1").fetchone() == (1,)
    finally:
        conn.close()


def test_get_connection_uses_explicit_path(tmp_path: Path) -> None:
    target = tmp_path / "explicit.db"
    conn = get_connection(target)
    try:
        assert target.exists()
    finally:
        conn.close()
