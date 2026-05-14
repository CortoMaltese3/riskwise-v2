"""Integration-ish test: ERA and custom paths share the same downstream pipeline.

Before the refactor, ``_run_era_scenario`` and ``_run_custom_scenario`` each
had their own ~100-line compute block. The refactor lifts the compute block
out of both and drives it from a single ``_execute`` that receives a
:class:`ScenarioDataStrategy`. This test proves the invariant: for the same
set of "loaded" objects, the sequence of downstream handler calls (cost-
benefit, impact calculation, geojson/parquet generation) is byte-identical
between the two strategies.

A full AAL snapshot requires the real CLIMADA stack, which is stubbed out
in ``conftest.py``. Instead, we substitute the data-loading outputs and
assert the downstream call graph matches — which is what the numerical
invariance ultimately reduces to.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def _make_runner(handlers=None):
    """Build a ``RunScenario`` without running its heavy ``__init__``.

    When ``handlers`` is provided, those mock instances are installed on
    the runner so two runners can share the same mock graph — necessary
    for the pipeline-equivalence test, which relies on identical mock
    return objects to produce identical call sequences.
    """
    from backend.run_scenario import RunScenario

    runner = RunScenario.__new__(RunScenario)
    handlers = handlers or {}
    runner.costben_handler = handlers.get("costben_handler") or MagicMock()
    runner.entity_handler = handlers.get("entity_handler") or MagicMock()
    runner.exposure_handler = handlers.get("exposure_handler") or MagicMock()
    runner.hazard_handler = handlers.get("hazard_handler") or MagicMock()
    runner.impact_handler = handlers.get("impact_handler") or MagicMock()
    runner.status = SimpleNamespace(set_error=lambda *a, **k: None)
    runner.logger = SimpleNamespace(
        log=lambda *a, **k: None,
        info=lambda *a, **k: None,
        warning=lambda *a, **k: None,
        error=lambda *a, **k: None,
    )
    # The geojson generators write to disk and exercise the partial-result
    # callback path; the call-graph test does not need either.
    runner._generate_geojsons_parallel = lambda *a, **kw: None
    return runner


def _make_request_data(**overrides):
    from backend.run_scenario import RequestData

    defaults = dict(
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
    """Strategy stub that hands back fixed objects regardless of mode.

    Using the same stub for both "ERA-like" and "custom-like" execution
    isolates the pipeline: whatever differences exist, they come from the
    compute code, not from the data the strategy produces.
    """

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


def _build_fixed_strategy():
    exposures = MagicMock(name="exposures")
    impfset_specs = MagicMock(name="impfset_specs")
    measures = []
    entity = SimpleNamespace(
        exposures=exposures,
        impfset_specs=impfset_specs,
        measures=measures,
        discount_rate=0.02,
        ref_year=2020,
    )
    hazard_present = MagicMock(name="hazard_present")
    hazard_future = MagicMock(name="hazard_future")
    return _FixedLoadStrategy(entity, hazard_present, hazard_future)


def _patch_module_helpers(monkeypatch):
    """Replace ``run_scenario`` module-level helpers with mocks.

    The pipeline calls ``update_progress`` and ``save_parquet_file`` as
    module-level imports (they used to live on ``self.base_handler``).
    The tests need to introspect their call args, so swap them with
    ``MagicMock`` instances bound on the runner module.
    """
    from backend import run_scenario

    progress_mock = MagicMock(name="update_progress")
    parquet_mock = MagicMock(name="save_parquet_file")
    monkeypatch.setattr(run_scenario, "update_progress", progress_mock)
    monkeypatch.setattr(run_scenario, "save_parquet_file", parquet_mock)
    return progress_mock, parquet_mock


def _recorded_calls(mock_obj):
    """Freeze mock call data as a list of (name, args, kwargs) tuples."""
    return [
        (name, tuple(repr(a) for a in args), tuple(sorted(kwargs.items())))
        for name, args, kwargs in mock_obj.mock_calls
    ]


class TestEraAndCustomShareDownstreamPipeline:
    @pytest.mark.parametrize("scenario", ["historical", "rcp85"])
    def test_call_graphs_match_when_loading_outputs_match(
        self, scenario, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Use a single shared set of handler mocks so that mock-created return
        # objects (e.g. ``calculate_cost_benefit``'s result) are identical for
        # both runs. Without sharing, the auto-generated mock IDs differ and
        # ``repr()`` comparisons drift despite the call graphs being logically
        # identical.
        _patch_module_helpers(monkeypatch)
        shared_handlers = {
            name: MagicMock()
            for name in (
                "costben_handler",
                "entity_handler",
                "exposure_handler",
                "hazard_handler",
                "impact_handler",
            )
        }
        fixed_strategy = _build_fixed_strategy()

        def _run(is_era: bool) -> None:
            runner = _make_runner(shared_handlers)
            runner.request_data = _make_request_data(is_era=is_era, scenario=scenario)
            runner._resolve_return_periods = lambda: (10, 20, 50, 100)
            runner._resolve_hazard_intensity_unit = lambda _entity: "m"
            runner._get_average_annual_growth = lambda: 0.02
            runner._execute(fixed_strategy)

        _run(is_era=True)
        # Snapshot after the ERA run, then reset and replay as custom.
        era_snapshots = {
            name: _recorded_calls(shared_handlers[name])
            for name in ("costben_handler", "impact_handler", "exposure_handler", "hazard_handler")
        }
        for handler in shared_handlers.values():
            handler.reset_mock()
        _run(is_era=False)

        for handler_name, era_calls in era_snapshots.items():
            custom_calls = _recorded_calls(shared_handlers[handler_name])
            assert era_calls == custom_calls, (
                f"{handler_name} call sequence diverged between ERA and custom paths"
            )


class TestExecuteProgressStops:
    def test_historical_run_does_not_emit_waterfall_progress(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Historical runs skip the waterfall plot step (progress 55)."""
        progress_mock, _ = _patch_module_helpers(monkeypatch)
        runner = _make_runner()
        runner.request_data = _make_request_data(scenario="historical")
        runner._resolve_return_periods = lambda: (10, 20)
        runner._resolve_hazard_intensity_unit = lambda _entity: ""
        runner._get_average_annual_growth = lambda: 0.0
        runner._execute(_build_fixed_strategy())

        progress_values = [call.args[0] for call in progress_mock.call_args_list]
        assert 55 not in progress_values
        assert progress_values[-1] == 100

    def test_future_run_emits_waterfall_progress(self, monkeypatch: pytest.MonkeyPatch) -> None:
        progress_mock, _ = _patch_module_helpers(monkeypatch)
        runner = _make_runner()
        runner.request_data = _make_request_data(scenario="rcp85")
        runner._resolve_return_periods = lambda: (10, 20)
        runner._resolve_hazard_intensity_unit = lambda _entity: ""
        runner._get_average_annual_growth = lambda: 0.0
        runner._execute(_build_fixed_strategy())

        progress_values = [call.args[0] for call in progress_mock.call_args_list]
        assert 55 in progress_values
        assert progress_values[-1] == 100
