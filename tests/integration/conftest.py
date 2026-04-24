"""Shared fixtures for the FastAPI integration suite (issue #114).

The integration tests exercise the real :mod:`backend.app` via
:class:`fastapi.testclient.TestClient`, against a freshly migrated DuckDB in
a temp directory. Heavy CLIMADA entrypoints (``_run_scenario_sync``,
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

import sys
import types
from collections.abc import Iterator
from pathlib import Path


# The dispatched run_fetch_*.py scripts transitively import CLIMADA at
# module top. Installing the full geospatial stack in CI would blow the
# test budget — and the integration suite only asserts API shape, not
# CLIMADA numerics — so stub the modules here in the same conservative
# fashion as ``tests/unit/conftest.py``: skip if the real package is
# importable so a local environment that has it keeps the real
# implementation.
class _ClimadaStub:
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


_stub_module("climada")
_stub_module("climada.util")
_stub_module("climada.util.api_client", Client=_ClimadaStub)
_stub_module(
    "climada.entity",
    DiscRates=_ClimadaStub,
    Entity=_ClimadaStub,
    Exposures=_ClimadaStub,
    ImpactFuncSet=_ClimadaStub,
)
_stub_module("climada.entity.measures", MeasureSet=_ClimadaStub)
_stub_module("climada.entity.impact_funcs", ImpactFunc=_ClimadaStub, ImpactFuncSet=_ClimadaStub)
_stub_module(
    "climada.engine", CostBenefit=_ClimadaStub, Impact=_ClimadaStub, ImpactCalc=_ClimadaStub
)
_stub_module(
    "climada.engine.cost_benefit",
    NO_MEASURE="no measure",
    risk_aai_agg=lambda *_, **__: None,
)
_stub_module("climada.hazard", Hazard=_ClimadaStub)
_stub_module("geopandas", GeoDataFrame=_ClimadaStub, read_file=lambda *_, **__: None)
_stub_module("shapely")
_stub_module("shapely.geometry", Point=_ClimadaStub)


import duckdb  # noqa: E402
import openpyxl  # noqa: E402
import pytest  # noqa: E402
from db.migrations import run_migrations  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from macroeconomic.cred_seeder import CRED_COLUMNS, seed_builtin_cred  # noqa: E402
from measures.measures_seeder import seed_builtin_measures  # noqa: E402


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


_MEASURES_COLUMNS = [
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


def _write_minimal_measures_xlsx(path: Path) -> None:
    """Tiny measures fixture: one flood (FL) + one heatwaves (HW) measure."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "measures"
    ws.append(_MEASURES_COLUMNS)
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
    wb.save(path)


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

    from app import app

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

    measures_xlsx = tmp_path / "measures.xlsx"
    _write_minimal_measures_xlsx(measures_xlsx)
    seed_builtin_measures(conn, measures_xlsx)
    conn.close()

    monkeypatch.setenv("RISKWISE_DB_PATH", str(tmp_db))
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")

    from app import app

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client
