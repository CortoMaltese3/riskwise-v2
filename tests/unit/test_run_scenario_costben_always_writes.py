"""``compute_cost_benefit_data`` runs even when the engine returns no measures.

Regression for issue #428. The old code gated the cost-benefit write behind
``if cost_benefit:`` so a run with zero applied measures left no
``cost_benefit_data.json`` on disk. The runner clears the temp dir at the start
of every run, so a restored scenario's hydrated payload would then be wiped
with nothing to replace it — the Adaptation view fell back to a backend error
("data not available") instead of the user-facing "no measures yet" empty state.

The fix is to always call ``compute_cost_benefit_data`` and let the writer
produce a ``measures: []`` payload.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


@dataclass
class _StubMeasure:
    name: str


@dataclass
class _StubEntity:
    exposures: object = None
    impfset_specs: list = field(default_factory=list)
    measures: list = field(default_factory=list)
    discount_rate: float = 0.02
    ref_year: int = 2020


def _make_runner():
    from backend.run_scenario import RunScenario

    runner = RunScenario.__new__(RunScenario)
    runner.costben_handler = MagicMock()
    runner.entity_handler = MagicMock()
    runner.exposure_handler = MagicMock()
    runner.hazard_handler = MagicMock()
    runner.impact_handler = MagicMock()
    runner.status = SimpleNamespace(set_error=lambda *a, **k: None)
    runner.logger = SimpleNamespace(
        log=lambda *a, **k: None,
        info=lambda *a, **k: None,
        warning=lambda *a, **k: None,
        error=lambda *a, **k: None,
    )
    runner._generate_geojsons_parallel = lambda *a, **kw: None
    return runner


def _make_request_data(**overrides):
    from backend.run_scenario import RequestData

    defaults: dict = dict(
        adaptation_measures=[],
        annual_growth=0.0,
        country_name="Thailand",
        country_code="THA",
        entity_filename="",
        exposure_type="crops",
        asset_type="economic",
        hazard_filename="",
        hazard_type="flood",
        hazard_code="FL",
        is_era=True,
        scenario="historical",
        time_horizon=(2024, 2050),
    )
    defaults.update(overrides)
    return RequestData(**defaults)


class _FixedLoadStrategy:
    entity_progress_message = "entity"
    exposure_progress_message = "exposure"
    hazard_progress_message = "hazard"
    cost_benefit_progress_message = "costben"
    impact_progress_message = "impact"

    def __init__(self, entity, hazard_present, hazard_future):
        self._entity = entity
        self._hazard_present = hazard_present
        self._hazard_future = hazard_future

    def load_entity_and_exposure(self, *_):
        return self._entity, self._entity.exposures

    def load_hazard_present(self, *_):
        return self._hazard_present

    def load_hazard_future(self, *_):
        return self._hazard_future


def _patch_module_helpers(monkeypatch):
    from backend import run_scenario

    monkeypatch.setattr(run_scenario, "update_progress", MagicMock())
    monkeypatch.setattr(run_scenario, "save_parquet_file", MagicMock())


def _run(runner, strategy):
    runner._resolve_return_periods = lambda: (10, 20, 50, 100)
    runner._resolve_hazard_intensity_unit = lambda _entity: "m"
    runner._get_average_annual_growth = lambda: 0.0
    runner._execute(strategy)


class TestCostBenefitAlwaysWrites:
    def test_empty_engine_result_still_invokes_compute_cost_benefit_data(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _StubEntity(exposures=MagicMock(name="exposures"), measures=[])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        # Engine returns an empty list — the zero-measures run path.
        runner.costben_handler.calculate_cost_benefit.return_value = []
        runner.request_data = _make_request_data(selected_measure_ids=[])

        _run(runner, strategy)

        # The fix: ``compute_cost_benefit_data`` must run even with an empty
        # engine result so the writer drops a ``measures: []`` payload on disk.
        assert runner.costben_handler.compute_cost_benefit_data.call_count == 1
        call = runner.costben_handler.compute_cost_benefit_data.call_args
        assert call.args[0] == []

    def test_non_empty_engine_result_still_invokes_compute_cost_benefit_data(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Guard against the inverse regression: the unconditional call must
        # still pass through engine results when they are populated.
        _patch_module_helpers(monkeypatch)
        entity = _StubEntity(
            exposures=MagicMock(name="exposures"),
            measures=[_StubMeasure(name="m_levee")],
        )
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        sentinel = [object()]
        runner.costben_handler.calculate_cost_benefit.return_value = sentinel
        runner.request_data = _make_request_data(selected_measure_ids=["m_levee"])

        _run(runner, strategy)

        assert runner.costben_handler.compute_cost_benefit_data.call_count == 1
        call = runner.costben_handler.compute_cost_benefit_data.call_args
        assert call.args[0] is sentinel
