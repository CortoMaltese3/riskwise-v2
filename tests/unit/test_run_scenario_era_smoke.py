"""End-to-end smoke test for ``RunScenario._execute`` on the engine path.

Acts as the regression canary that would have caught the
``'ExposureArrays' object has no attribute 'gdf'`` crash that triggered
issue #293. Builds a minimal :class:`EntityBundle` + :class:`HazardArrays`
in memory (no I/O), drives the pipeline through
``RunScenario._execute(strategy)`` with a stub strategy, and asserts the
run completes without setting an error status.

Skipped when ``climate_lama_engine`` is not importable.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import numpy as np
import pytest

pytest.importorskip("climate_lama_engine")
pytest.importorskip("scipy")

from scipy import sparse  # noqa: E402

from backend.engine.types import (  # noqa: E402
    EntityBundle,
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
)


def _make_entity() -> EntityBundle:
    """A 5-asset, 1-impact-function bundle on two hazard centroids."""
    exposures = ExposureArrays(
        values=np.array([100_000.0, 200_000.0, 300_000.0, 400_000.0, 500_000.0]),
        # ``centroid_idx`` is the loader's placeholder; ``assign_centroids`` fills it for real
        centroid_idx=np.arange(5, dtype=np.intp),
        impf_id=np.ones(5, dtype=np.int64),
        lat=np.array([37.9, 37.9, 38.0, 38.0, 38.0]),
        lon=np.array([23.7, 23.7, 23.8, 23.8, 23.8]),
        value_unit="USD",
    )
    impf = ImpactFunctionSpec(
        haz_type="FL",
        exp_type="generic",
        id=1,
        name="generic",
        intensity_unit="m",
        intensity=(0.0, 0.5, 1.0, 2.0, 3.0, 5.0),
        mdd=(0.0, 0.02, 0.07, 0.25, 0.50, 0.80),
        paa=(0.0, 0.20, 0.40, 0.70, 0.90, 1.00),
    )
    return EntityBundle(
        exposures=exposures,
        impfset_specs=[impf],
        measures=[],
        discount_rate=0.02,
        ref_year=2020,
    )


def _make_hazard() -> HazardArrays:
    return HazardArrays(
        intensity=sparse.csr_matrix(np.array([[0.5, 1.0], [1.5, 2.5], [3.0, 4.0]])),
        frequency=np.array([0.1, 0.01, 0.002]),
        centroid_lat=np.array([37.9, 38.0]),
        centroid_lon=np.array([23.7, 23.8]),
        haz_type="FL",
        intensity_unit="m",
        frequency_type="marginal",
        event_names=("RP-10", "RP-100", "RP-500"),
    )


class _StubStrategy:
    """Minimal ``ScenarioDataStrategy`` returning pre-built domain objects."""

    entity_progress_message = "entity"
    exposure_progress_message = "exposure"
    hazard_progress_message = "hazard"
    cost_benefit_progress_message = "costben"
    impact_progress_message = "impact"

    def __init__(self, entity: EntityBundle, hazard: HazardArrays) -> None:
        self._entity = entity
        self._hazard = hazard

    def load_entity_and_exposure(self, *_):
        return self._entity, self._entity.exposures

    def load_hazard_present(self, *_):
        return self._hazard

    def load_hazard_future(self, *_):
        return self._hazard


def _make_runner(entity, hazard):
    """Build a ``RunScenario`` without touching its heavy ``__init__``."""
    from backend.entity.entity_handler import EntityHandler
    from backend.impact.impact_handler import ImpactHandler
    from backend.run_scenario import RequestData, RunScenario

    runner = RunScenario.__new__(RunScenario)
    runner.costben_handler = MagicMock()  # no measures → no real costben call
    runner.entity_handler = EntityHandler()
    runner.exposure_handler = MagicMock()  # no geojson I/O in the smoke
    runner.hazard_handler = MagicMock()
    runner.impact_handler = ImpactHandler()
    runner.status = SimpleNamespace(set_error=MagicMock(), error_code=None, error_message=None)
    runner.logger = SimpleNamespace(log=lambda *a, **k: None)
    runner.request_data = RequestData(
        adaptation_measures=[],
        annual_growth=0.0,
        country_name="Egypt",
        country_code="EGY",
        entity_filename="",
        exposure_type="generic",
        asset_type="economic",
        hazard_filename="",
        hazard_type="flood",
        hazard_code="FL",
        is_era=True,
        scenario="historical",
        time_horizon=(2020, 2050),
    )
    runner._resolve_return_periods = lambda: (10, 25, 50, 100)
    runner._resolve_hazard_intensity_unit = lambda _entity: "m"
    runner._get_average_annual_growth = lambda: 0.0
    # The geojson generators write to disk; bypass them for the smoke test.
    runner._generate_geojsons_parallel = lambda *a, **kw: None
    return runner


def test_execute_runs_without_setting_error_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # ``save_parquet_file`` is a module-level helper now (#246). The smoke
    # test does not exercise the parquet pipeline and the unit-test env
    # may not ship pyarrow, so swap it out for a no-op.
    from backend import run_scenario

    monkeypatch.setattr(run_scenario, "save_parquet_file", lambda *a, **k: None)
    runner = _make_runner(_make_entity(), _make_hazard())
    strategy = _StubStrategy(_make_entity(), _make_hazard())

    runner._execute(strategy)

    runner.status.set_error.assert_not_called()


def test_impact_calc_returns_engine_impact() -> None:
    """Verify the call lands on the engine path and produces a non-None Impact."""
    import climate_lama_engine as cc

    entity = _make_entity()
    hazard = _make_hazard()
    runner = _make_runner(entity, hazard)

    impact = runner.impact_handler.calculate_impact(entity.exposures, hazard, entity.impfset_specs)
    assert isinstance(impact, cc.Impact)
    assert impact.aai_agg > 0
