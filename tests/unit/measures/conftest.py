"""Shared fixtures for adaptation measures unit tests."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from backend.db.migrations import run_migrations
from backend.measures.measures_seeder import seed_builtin_measures


def write_minimal_measures_json(path: Path) -> None:
    """Write a tiny built-in catalog covering both HW and FL hazards.

    Mirrors the on-disk shape of ``requirements/adaptation_measures.json``.
    Rows omit the ``code`` field so the legacy "no code column" branch
    of ``build_display_name_lookup`` keeps an exercising fixture.
    """
    path.write_text(
        json.dumps(
            [
                {
                    "name": "green_roofs",
                    "peril_ID": "HW",
                    "cost": 20_000_000,
                    "MDD impact a": 0.69,
                },
                {
                    "name": "trees_planting",
                    "peril_ID": "HW",
                    "cost": 31_000_000,
                    "MDD impact a": 0.675,
                },
                {
                    "name": "retention_reservoirs",
                    "peril_ID": "FL",
                    "cost": 10_000_000,
                    "MDD impact a": 0.85,
                },
            ]
        ),
        encoding="utf-8",
    )


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
    src = tmp_path / "measures.json"
    write_minimal_measures_json(src)
    seed_builtin_measures(conn, src)
    conn.close()
    return db_path


@pytest.fixture
def api_client(seeded_db, monkeypatch):
    monkeypatch.setenv("RISKWISE_DB_PATH", str(seeded_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")
    from backend.app import app

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
