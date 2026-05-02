"""Shared fixtures for macro unit tests."""

from __future__ import annotations

from pathlib import Path

import duckdb
import openpyxl
import pytest
from fastapi.testclient import TestClient

from backend.db.migrations import run_migrations
from backend.macroeconomic.cred_seeder import CRED_COLUMNS, seed_builtin_cred


def write_minimal_xlsx(path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    ws.append(CRED_COLUMNS)
    for year in [2024, 2025]:
        for adp in [0.0, 0.33]:
            ws.append(["egypt", "historical", adp, "gdp", "whole_economy", year, 0.001 * year])
    wb.save(path)


@pytest.fixture
def migrated_conn(tmp_path: Path):
    conn = duckdb.connect(str(tmp_path / "test.db"))
    run_migrations(conn)
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def seeded_db(tmp_path: Path):
    db_path = tmp_path / "test.db"
    conn = duckdb.connect(str(db_path))
    run_migrations(conn)
    xlsx = tmp_path / "cred.xlsx"
    write_minimal_xlsx(xlsx)
    seed_builtin_cred(conn, xlsx)
    conn.close()
    return db_path


@pytest.fixture
def api_client(seeded_db, monkeypatch):
    monkeypatch.setenv("RISKWISE_DB_PATH", str(seeded_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    from backend.app import app

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
