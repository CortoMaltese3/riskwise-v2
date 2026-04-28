"""Shared fixtures for the integration-parity suite (issue #163).

The four scenario tests in this directory each run ``RunScenario`` end-to-end
twice — once with ``RISKWISE_ENGINE_BACKEND=climada`` and once with
``=engine`` — and assert the engine-side outputs land within the ADR §6.3
tolerances (``±2 %`` on ``aai_agg``, ``±5 %`` on RP losses and BCRs;
exact equality on ``n_valid_points`` / ``n_excluded_points``).

These tests require the full geospatial stack (real CLIMADA, climate-lama-engine,
geopandas, rasterio, h5py). Without them the module-level skip below
records a ``skipped`` entry in the parity summary so CI environments that
cannot install CLIMADA still produce a coherent ``_summary.md`` artifact.

Module pathing notes:
    - ``backend/`` is on the import path via ``pyproject.toml`` so handler
      modules import as bare names (``run_scenario``, ``impact.impact_handler``).
    - The DB path is overridden per-test via :data:`db.connection.DB_PATH_ENV_VAR`
      (``RISKWISE_DB_PATH``); migrations are applied to the tmp file before
      ``RunScenario`` is constructed.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import pytest

from tests.parity import _summary

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_DATA_ENTITIES_DIR = _REPO_ROOT / "data" / "entities"
_DATA_HAZARDS_DIR = _REPO_ROOT / "data" / "hazards"
SNAPSHOTS_DIR = Path(__file__).resolve().parent / "snapshots"
LEGACY_SNAPSHOTS_DIR = SNAPSHOTS_DIR / "legacy"
ENGINE_SNAPSHOTS_DIR = SNAPSHOTS_DIR / "engine"

_AAI_TOLERANCE = 0.02
_RP_TOLERANCE = 0.05
_BCR_TOLERANCE = 0.05
_RETURN_PERIODS: tuple[int, int, int] = (50, 100, 250)


@dataclass
class BackendMetrics:
    """Raw numerical outputs from one backend run."""

    aai_agg: float
    rp_losses: dict[str, float]
    n_valid_points: int
    n_excluded_points: int
    bcrs: dict[str, float] = field(default_factory=dict)


@dataclass
class ParityResult:
    """Both backends' metrics for one scenario, plus the scenario name."""

    scenario: str
    climada: BackendMetrics
    engine: BackendMetrics


# ---------------------------------------------------------------------------
# Skip guards
# ---------------------------------------------------------------------------


def _real_climada_available() -> bool:
    """True iff the real (non-stub) CLIMADA package is importable."""
    try:
        import climada  # noqa: F401
    except ImportError:
        return False
    return getattr(climada, "__version__", None) is not None


def _engine_available() -> bool:
    try:
        import climate_lama_engine  # noqa: F401
    except ImportError:
        return False
    return True


SKIP_REASON_NO_STACK = (
    "Real CLIMADA + climate-lama-engine + geospatial stack required "
    "to run integration parity scenarios."
)


def _data_files_present(entity_filename: str, hazard_filename: str) -> tuple[bool, str]:
    entity = _DATA_ENTITIES_DIR / entity_filename
    hazard = _DATA_HAZARDS_DIR / hazard_filename
    if not entity.is_file():
        return False, f"missing entity file {entity_filename}"
    if not hazard.is_file():
        return False, f"missing hazard file {hazard_filename}"
    return True, ""


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------


def _snapshot_path(side: str, scenario: str) -> Path:
    base = LEGACY_SNAPSHOTS_DIR if side == "legacy" else ENGINE_SNAPSHOTS_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{scenario}.json"


def _write_snapshot(side: str, scenario: str, metrics: BackendMetrics) -> None:
    payload = asdict(metrics)
    _snapshot_path(side, scenario).write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# DB + env scaffolding
# ---------------------------------------------------------------------------


@pytest.fixture
def parity_db(tmp_path: Path) -> Iterator[Path]:
    """Migrated DuckDB file isolated to ``tmp_path`` for one parity run.

    The full migration chain runs once per test so the scenarios row,
    cache_store, and result blobs the runner persists land in a clean
    schema. Built-in seeders are skipped via the ``RISKWISE_SKIP_*``
    environment variables set by :func:`parity_runner` — the parity tests
    do not exercise CRED or measures lookup paths.
    """
    import duckdb
    from db.migrations import run_migrations

    db_path = tmp_path / "riskwise-parity.duckdb"
    conn = duckdb.connect(str(db_path))
    run_migrations(conn)
    conn.close()
    yield db_path


# ---------------------------------------------------------------------------
# Capture-and-run plumbing
# ---------------------------------------------------------------------------


def _coerce_rp_loss(impact: Any, return_periods: tuple[int, ...]) -> dict[str, float]:
    """Compute RP losses for ``return_periods`` from a CLIMADA Impact-like object.

    Both backends return a CLIMADA-shaped ``Impact`` (the engine adapter
    wraps its own results in one for compatibility), so ``calc_freq_curve``
    is available on both. The result is keyed by string RP for stable JSON
    snapshot ordering.
    """
    import numpy as np

    rp_array = np.array(return_periods, dtype=float)
    curve = impact.calc_freq_curve(rp_array)
    return {
        str(int(rp)): float(loss) for rp, loss in zip(curve.return_per, curve.impact, strict=True)
    }


def _capture_metrics(impact: Any, cost_benefit: list | None) -> BackendMetrics:
    """Project a backend's run output onto the parity metric tuple.

    ``impact`` is the active (future-when-available, present otherwise)
    CLIMADA-shaped Impact object captured during the run. ``cost_benefit``
    is the list of ``CostBenefitResult`` rows returned by the cost-benefit
    handler (may be empty for present-only or no-measure scenarios).
    """
    import numpy as np

    eai = np.asarray(impact.eai_exp)
    n_valid_points = int((eai > 0).sum())
    n_excluded_points = int((eai == 0).sum())

    bcrs: dict[str, float] = {}
    for entry in cost_benefit or []:
        bcrs[str(entry.name)] = float(entry.bcr)

    return BackendMetrics(
        aai_agg=float(impact.aai_agg),
        rp_losses=_coerce_rp_loss(impact, _RETURN_PERIODS),
        n_valid_points=n_valid_points,
        n_excluded_points=n_excluded_points,
        bcrs=bcrs,
    )


def _run_one_backend(
    payload: dict,
    backend: str,
    monkeypatch: pytest.MonkeyPatch,
    db_path: Path,
) -> BackendMetrics:
    """Drive ``RunScenario`` once with the requested backend; return metrics.

    Captures the active-side (future-when-set, else present) impact and
    the cost-benefit result list via monkey-patches on the handler
    methods. Both patches forward to the real implementation, so the rest
    of the pipeline runs unchanged. The scenario's geojson and parquet
    side-effects land in the temp directory the runner writes to and are
    discarded with the tmp fixture.
    """
    monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", backend)
    monkeypatch.setenv("RISKWISE_DB_PATH", str(db_path))
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    monkeypatch.setenv("RISKWISE_SKIP_CRED_SEED", "1")
    monkeypatch.setenv("RISKWISE_SKIP_MEASURES_SEED", "1")

    from costben.costben_handler import CostBenefitHandler
    from impact.impact_handler import ImpactHandler
    from run_scenario import RunScenario

    captured: dict[str, Any] = {"impacts": [], "cost_benefit": None}

    real_impact = ImpactHandler.calculate_impact
    real_cb = CostBenefitHandler.calculate_cost_benefit

    def _wrapped_impact(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        result = real_impact(self, *args, **kwargs)
        captured["impacts"].append(result)
        return result

    def _wrapped_cb(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        result = real_cb(self, *args, **kwargs)
        captured["cost_benefit"] = result
        return result

    monkeypatch.setattr(ImpactHandler, "calculate_impact", _wrapped_impact)
    monkeypatch.setattr(CostBenefitHandler, "calculate_cost_benefit", _wrapped_cb)

    runner = RunScenario(dict(payload))
    response = runner.run_scenario()
    if response.get("status", {}).get("code") != 2000:
        raise RuntimeError(
            f"Scenario run failed under backend={backend!r}: "
            f"{response.get('status', {}).get('message')}"
        )

    if not captured["impacts"]:
        raise RuntimeError(
            f"backend={backend!r}: no impact was captured — the runner did "
            "not invoke ImpactHandler.calculate_impact"
        )

    # The runner computes present-day impact first and then, for non-historical
    # runs, the future-scenario impact. The active-side metrics are what the
    # reports + frontend consume, so the *last* captured Impact is the parity
    # subject. For historical / present-only runs that is also the only one.
    active_impact = captured["impacts"][-1]
    return _capture_metrics(active_impact, captured["cost_benefit"])


# ---------------------------------------------------------------------------
# Public fixture
# ---------------------------------------------------------------------------


ParityRunner = Callable[[str, dict], ParityResult]


@pytest.fixture
def parity_runner(
    monkeypatch: pytest.MonkeyPatch,
    parity_db: Path,
    tmp_path: Path,
) -> ParityRunner:
    """Return a callable ``run(scenario_name, payload) -> ParityResult``.

    The callable runs both backends, snapshots their metrics, and
    returns a :class:`ParityResult` so the caller can assert deltas.
    Skips with a clear reason when CLIMADA / engine / data files are
    not available so CI environments without the geospatial stack stay
    green.
    """
    if not _real_climada_available() or not _engine_available():
        _summary.record_skip("(suite)", SKIP_REASON_NO_STACK)
        pytest.skip(SKIP_REASON_NO_STACK)

    # Each scenario's runner spawns a fresh DATA_TEMP_DIR via the base
    # handler; redirecting it under ``tmp_path`` keeps writes isolated
    # so a test that errors out doesn't leak files into the workspace.
    monkeypatch.setenv("RISKWISE_TEMP_DIR", str(tmp_path / "data-temp"))

    def _run(scenario: str, payload: dict) -> ParityResult:
        present, missing = _data_files_present(
            payload.get("exposureFile", ""),
            payload.get("hazardFile", ""),
        )
        if not present:
            _summary.record_skip(scenario, missing)
            pytest.skip(missing)

        # Run CLIMADA first so the cache layer and DB rows reflect that
        # baseline, then engine. Each call uses an inner monkeypatch
        # context so handler patches do not leak across backends.
        with monkeypatch.context() as m:
            climada_metrics = _run_one_backend(payload, "climada", m, parity_db)
        with monkeypatch.context() as m:
            engine_metrics = _run_one_backend(payload, "engine", m, parity_db)

        _write_snapshot("legacy", scenario, climada_metrics)
        _write_snapshot("engine", scenario, engine_metrics)

        return ParityResult(scenario=scenario, climada=climada_metrics, engine=engine_metrics)

    return _run


# ---------------------------------------------------------------------------
# Assertion helpers (called by individual scenario tests)
# ---------------------------------------------------------------------------


def _within_tolerance(climada: float, engine: float, tolerance: float) -> tuple[bool, float | None]:
    """Return (passed, delta-as-fraction) using the parity-comparison rule.

    When the CLIMADA value is zero, the engine value must also be zero
    (delta is reported as ``None`` because a relative comparison is
    undefined). Otherwise ``delta = |engine - climada| / |climada|`` and
    the gate is ``delta < tolerance``.
    """
    if climada == 0:
        return (engine == 0, None)
    delta = abs(engine - climada) / abs(climada)
    return (delta < tolerance, delta)


def assert_parity_and_record(result: ParityResult) -> None:
    """Run all parity assertions and record metric rows for the summary.

    Records every metric (passing or failing) before raising on the first
    failure so the markdown summary always lists every scenario's deltas
    even when one of the gates trips. This is the same shape the legacy
    notebook 08 prints.
    """
    rows: list[_summary.MetricRow] = []

    aai_passed, aai_delta = _within_tolerance(
        result.climada.aai_agg, result.engine.aai_agg, _AAI_TOLERANCE
    )
    rows.append(
        _summary.MetricRow(
            metric="aai_agg",
            climada=result.climada.aai_agg,
            engine=result.engine.aai_agg,
            gate=f"±{_AAI_TOLERANCE * 100:.0f} %",
            delta=aai_delta,
            passed=aai_passed,
        )
    )

    rp_failures: list[str] = []
    for rp_key in (str(rp) for rp in _RETURN_PERIODS):
        c_loss = result.climada.rp_losses.get(rp_key, 0.0)
        e_loss = result.engine.rp_losses.get(rp_key, 0.0)
        passed, delta = _within_tolerance(c_loss, e_loss, _RP_TOLERANCE)
        rows.append(
            _summary.MetricRow(
                metric=f"RP-{rp_key} loss",
                climada=c_loss,
                engine=e_loss,
                gate=f"±{_RP_TOLERANCE * 100:.0f} %",
                delta=delta,
                passed=passed,
            )
        )
        if not passed:
            rp_failures.append(
                f"RP-{rp_key}: climada={c_loss:.6g} engine={e_loss:.6g} "
                f"delta={delta if delta is None else delta * 100:.3f} %"
            )

    bcr_failures: list[str] = []
    for name in sorted(set(result.climada.bcrs) | set(result.engine.bcrs)):
        c_bcr = float(result.climada.bcrs.get(name, 0.0))
        e_bcr = float(result.engine.bcrs.get(name, 0.0))
        passed, delta = _within_tolerance(c_bcr, e_bcr, _BCR_TOLERANCE)
        rows.append(
            _summary.MetricRow(
                metric=f"BCR[{name}]",
                climada=c_bcr,
                engine=e_bcr,
                gate=f"±{_BCR_TOLERANCE * 100:.0f} %",
                delta=delta,
                passed=passed,
            )
        )
        if not passed:
            bcr_failures.append(
                f"BCR[{name}]: climada={c_bcr:.6g} engine={e_bcr:.6g} "
                f"delta={delta if delta is None else delta * 100:.3f} %"
            )

    n_valid_passed = result.climada.n_valid_points == result.engine.n_valid_points
    rows.append(
        _summary.MetricRow(
            metric="n_valid_points",
            climada=result.climada.n_valid_points,
            engine=result.engine.n_valid_points,
            gate="exact",
            delta=None,
            passed=n_valid_passed,
        )
    )

    n_excluded_passed = result.climada.n_excluded_points == result.engine.n_excluded_points
    rows.append(
        _summary.MetricRow(
            metric="n_excluded_points",
            climada=result.climada.n_excluded_points,
            engine=result.engine.n_excluded_points,
            gate="exact",
            delta=None,
            passed=n_excluded_passed,
        )
    )

    _summary.record_scenario(result.scenario, rows)

    # Now raise on the first failed gate; the summary already has the rows.
    assert aai_passed, (
        f"aai_agg outside ±{_AAI_TOLERANCE * 100:.0f} % gate: "
        f"climada={result.climada.aai_agg:.6g} engine={result.engine.aai_agg:.6g} "
        f"delta={aai_delta if aai_delta is None else aai_delta * 100:.3f} %"
    )
    assert not rp_failures, "RP losses outside gate:\n  " + "\n  ".join(rp_failures)
    assert not bcr_failures, "BCRs outside gate:\n  " + "\n  ".join(bcr_failures)
    assert n_valid_passed, (
        f"n_valid_points mismatch: "
        f"climada={result.climada.n_valid_points} engine={result.engine.n_valid_points}"
    )
    assert n_excluded_passed, (
        f"n_excluded_points mismatch: "
        f"climada={result.climada.n_excluded_points} engine={result.engine.n_excluded_points}"
    )


# ---------------------------------------------------------------------------
# Session hooks: write _summary.md at end of run
# ---------------------------------------------------------------------------


def pytest_sessionstart(session: pytest.Session) -> None:  # noqa: ARG001
    """Reset the in-memory summary registry at session start."""
    _summary.reset()


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:  # noqa: ARG001
    """Write ``tests/parity/_summary.md`` only when parity tests actually ran.

    Pytest loads this conftest whenever the ``tests/parity`` directory is
    inside the collection root, even for ``pytest tests/unit/...`` runs
    that select no parity tests. Gating on ``_summary.has_records()``
    keeps those unrelated runs from clobbering the summary with an empty
    placeholder. The file is otherwise rewritten on every parity run;
    issue #163 verification reads it via ``cat tests/parity/_summary.md``.
    """
    if not _summary.has_records():
        return
    _summary.write_summary(Path(__file__).resolve().parent)


__all__ = [
    "BackendMetrics",
    "ENGINE_SNAPSHOTS_DIR",
    "LEGACY_SNAPSHOTS_DIR",
    "ParityResult",
    "ParityRunner",
    "SKIP_REASON_NO_STACK",
    "SNAPSHOTS_DIR",
    "assert_parity_and_record",
]
