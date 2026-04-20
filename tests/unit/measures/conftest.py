"""Shared fixtures for adaptation measures unit tests."""

from __future__ import annotations

from pathlib import Path

import duckdb
import openpyxl
import pytest
from db.migrations import run_migrations
from fastapi.testclient import TestClient
from measures.measures_seeder import seed_builtin_measures


def write_minimal_measures_xlsx(path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    ws.append(
        [
            "name",
            "color",
            "cost",
            "hazard intensity impact a",
            "hazard intensity impact b",
            "hazard high frequency cutoff",
            "hazard event set",
            "MDD impact a",
            "MDD impact b",
            "PAA impact a",
            "PAA impact b",
            "damagefunctions map",
            "assets file",
            "Region_ID",
            "risk transfer attachement",
            "risk transfer cover",
            "risk transfer cost factor",
            "peril_ID",
        ]
    )
    ws.append(
        [
            "green_roofs",
            "0 0.42 0.36",
            20_000_000,
            1,
            0,
            0,
            "nil",
            0.69,
            0,
            1,
            0,
            "nil",
            "nil",
            0,
            0,
            0,
            1,
            "HW",
        ]
    )
    ws.append(
        [
            "trees_planting",
            "0.01 0.67 0.51",
            31_000_000,
            1,
            0,
            0,
            "nil",
            0.675,
            0,
            1,
            0,
            "nil",
            "nil",
            0,
            0,
            0,
            1,
            "HW",
        ]
    )
    ws.append(
        [
            "retention_reservoirs",
            "0.16 0.38 0.56",
            10_000_000,
            1,
            0,
            0,
            "nil",
            0.85,
            0,
            1,
            0,
            "nil",
            "nil",
            0,
            0,
            0,
            1,
            "FL",
        ]
    )
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
    xlsx = tmp_path / "measures.xlsx"
    write_minimal_measures_xlsx(xlsx)
    seed_builtin_measures(conn, xlsx)
    conn.close()
    return db_path


@pytest.fixture
def api_client(seeded_db, monkeypatch):
    monkeypatch.setenv("RISKWISE_DB_PATH", str(seeded_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")
    from app import app

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
