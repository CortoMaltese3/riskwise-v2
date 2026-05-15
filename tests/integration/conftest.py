"""Shared fixtures for the FastAPI integration suite (issue #114).

The integration tests exercise the real :mod:`backend.app` via
:class:`fastapi.testclient.TestClient`, against a freshly migrated DuckDB in
a temp directory. Heavy engine entrypoints (``_run_scenario_sync``,
``_dispatch_sync``) are monkey-patched per-test so the suite runs in a
vanilla Python environment without the geospatial stack.

Conventions:
    - ``tmp_db`` gives a writable DuckDB path with the full migration chain
      applied. Built-in CRED and measures seeds are skipped via env vars so
      each test file can seed only what it needs.
    - ``api_client`` stands up the FastAPI app against that DB. The lifespan
      runs under this fixture, so every test sees a consistent startup
      sequence (migrations, custom-country scan, disabled seeders).
    - ``seeded_client`` is ``api_client`` plus the built-in CRED and
      adaptation-measures seed data — the baseline most read-path tests need.
"""

from __future__ import annotations

import json
import sys
import types
from collections.abc import Iterator
from pathlib import Path


class _GeoStub:
    def __init__(self, *_: object, **__: object) -> None:
        pass


def _stub_module(name: str, **attrs: object) -> None:
    if name in sys.modules:
        return
    try:
        __import__(name)
    except ImportError:
        module = types.ModuleType(name)
        for attr, value in attrs.items():
            setattr(module, attr, value)
        sys.modules[name] = module


# Optional geospatial-stack stubs so the FastAPI integration suite can run
# without geopandas / shapely installed. After #166 CLIMADA itself is gone
# from the dependency tree.
_stub_module("geopandas", GeoDataFrame=_GeoStub, read_file=lambda *_, **__: None)
_stub_module("shapely")
_stub_module("shapely.geometry", Point=_GeoStub)


import duckdb  # noqa: E402
import openpyxl  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.db.migrations import run_migrations  # noqa: E402
from backend.macroeconomic.cred_seeder import CRED_COLUMNS, seed_builtin_cred  # noqa: E402
from backend.measures.measures_seeder import seed_builtin_measures  # noqa: E402


def _write_minimal_cred_xlsx(path: Path) -> None:
    """Tiny CRED fixture: two years × two adaptation levels for Egypt."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "cred_output"
    ws.append(CRED_COLUMNS)
    for year in (2024, 2025):
        for adp in (0.0, 0.33):
            ws.append(["egypt", "historical", adp, "gdp", "whole_economy", year, 0.001 * year])
    wb.save(path)


def _write_minimal_measures_json(path: Path) -> None:
    """Tiny measures fixture: one flood (FL) + one heatwaves (HW) measure."""
    rows = [
        {
            "name": "retention_reservoirs",
            "peril_ID": "FL",
            "cost": 10_000_000,
            "MDD impact a": 0.85,
        },
        {
            "name": "green_roofs",
            "peril_ID": "HW",
            "cost": 20_000_000,
            "MDD impact a": 0.69,
        },
    ]
    path.write_text(json.dumps(rows), encoding="utf-8")


@pytest.fixture
def tmp_db(tmp_path: Path) -> Iterator[Path]:
    """Fresh DuckDB in ``tmp_path`` with migrations applied; torn down after each test.

    The underlying file is left on disk — ``tmp_path`` is already a
    per-test directory pytest cleans up, so an explicit ``unlink`` would
    be redundant. Closing the connection here guarantees the file is not
    held open when the test subsequently points the app at it.
    """
    db_path = tmp_path / "riskwise.duckdb"
    conn = duckdb.connect(str(db_path))
    run_migrations(conn)
    conn.close()
    yield db_path


@pytest.fixture
def api_client(tmp_db: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Unseeded TestClient: fresh DB, every built-in seeder disabled.

    Use this when a test wants to assert behaviour against an empty store
    (e.g. an endpoint that should return ``[]``) or when it will seed its
    own rows directly via the ``db.*`` helpers.
    """
    monkeypatch.setenv("RISKWISE_DB_PATH", str(tmp_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")

    from backend.app import app

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client


@pytest.fixture
def seeded_client(
    tmp_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    """TestClient with built-in CRED + measures seeded into ``tmp_db``.

    Baseline for the measures and macro endpoints: seeding happens before
    the app lifespan starts so the seeders inside ``_lifespan`` are
    skipped (via ``RISKWISE_SKIP_*_SEED``) and the in-test data is the
    only source of truth.
    """
    conn = duckdb.connect(str(tmp_db))
    cred_xlsx = tmp_path / "cred.xlsx"
    _write_minimal_cred_xlsx(cred_xlsx)
    seed_builtin_cred(conn, cred_xlsx)

    measures_src = tmp_path / "measures.json"
    _write_minimal_measures_json(measures_src)
    seed_builtin_measures(conn, measures_src)
    conn.close()

    monkeypatch.setenv("RISKWISE_DB_PATH", str(tmp_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")

    from backend.app import app

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client
