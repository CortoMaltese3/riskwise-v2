"""``selected_measure_ids`` scopes the entity's measures before cost-benefit.

Covers issue #373. The runner accepts an optional list of measure names
(matching ``MeasureSpec.name``) and filters the loaded entity's measure
set before the engine sees it. ``None`` preserves the legacy
"use every measure" behaviour. The filter must apply to both present
and future entities so CLIMADA's identical-measure-set invariant holds.
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
    """Dataclass entity stub — ``_filter_entity_measures`` round-trips via
    ``dataclasses.replace`` so the test fixture must be a dataclass."""

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


def _build_entity(measure_names: list[str]) -> _StubEntity:
    return _StubEntity(
        exposures=MagicMock(name="exposures"),
        impfset_specs=[],
        measures=[_StubMeasure(name=n) for n in measure_names],
    )


class TestSelectedMeasureIdsAtRequestBoundary:
    def test_field_defaults_to_none(self) -> None:
        data = _make_request_data()
        assert data.selected_measure_ids is None

    def test_explicit_none_is_accepted(self) -> None:
        data = _make_request_data(selected_measure_ids=None)
        assert data.selected_measure_ids is None

    def test_explicit_list_is_stored_verbatim(self) -> None:
        data = _make_request_data(selected_measure_ids=["m_levee", "m_pumps"])
        assert data.selected_measure_ids == ["m_levee", "m_pumps"]

    def test_from_request_threads_camelcase_field_through(self) -> None:
        from backend import run_scenario
        from backend.run_scenario import RequestData

        class _HazardStub:
            def get_hazard_code(self, _hazard_type: str) -> str:
                return "FL"

        request = {
            "countryName": "Thailand",
            "hazardType": "flood",
            "selectedMeasureIds": ["m_levee", "m_drainage"],
        }
        # Patch the country helpers so the classmethod doesn't pull pycountry
        # into the test runtime.
        import pytest

        monkey = pytest.MonkeyPatch()
        try:
            monkey.setattr(run_scenario, "sanitize_country_name", lambda name: name)
            monkey.setattr(run_scenario, "get_iso3_country_code", lambda _: "THA")
            data = RequestData.from_request(request, _HazardStub())
        finally:
            monkey.undo()
        assert data.selected_measure_ids == ["m_levee", "m_drainage"]

    def test_from_request_omitted_field_resolves_to_none(self) -> None:
        from backend import run_scenario
        from backend.run_scenario import RequestData

        class _HazardStub:
            def get_hazard_code(self, _hazard_type: str) -> str:
                return "FL"

        import pytest

        monkey = pytest.MonkeyPatch()
        try:
            monkey.setattr(run_scenario, "sanitize_country_name", lambda name: name)
            monkey.setattr(run_scenario, "get_iso3_country_code", lambda _: "THA")
            data = RequestData.from_request({"countryName": "Thailand"}, _HazardStub())
        finally:
            monkey.undo()
        assert data.selected_measure_ids is None


class TestRunnerFiltersMeasures:
    def _run(self, runner, strategy):
        runner._resolve_return_periods = lambda: (10, 20, 50, 100)
        runner._resolve_hazard_intensity_unit = lambda _entity: "m"
        runner._get_average_annual_growth = lambda: 0.0
        runner._execute(strategy)

    def test_none_passes_every_measure_through(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage", "m_pumps"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(selected_measure_ids=None)
        self._run(runner, strategy)

        calculate_calls = runner.costben_handler.calculate_cost_benefit.call_args_list
        assert calculate_calls, "calculate_cost_benefit must run"
        entity_arg = calculate_calls[0].args[1]
        assert [m.name for m in entity_arg.measures] == ["m_levee", "m_drainage", "m_pumps"]

    def test_subset_filters_entity_measures(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage", "m_pumps"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(selected_measure_ids=["m_levee", "m_drainage"])
        self._run(runner, strategy)

        entity_arg = runner.costben_handler.calculate_cost_benefit.call_args_list[0].args[1]
        assert [m.name for m in entity_arg.measures] == ["m_levee", "m_drainage"]

    def test_unknown_ids_are_ignored(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(
            selected_measure_ids=["m_levee", "m_does_not_exist"]
        )
        self._run(runner, strategy)

        entity_arg = runner.costben_handler.calculate_cost_benefit.call_args_list[0].args[1]
        assert [m.name for m in entity_arg.measures] == ["m_levee"]

    def test_empty_list_filters_everything(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(selected_measure_ids=[])
        self._run(runner, strategy)

        entity_arg = runner.costben_handler.calculate_cost_benefit.call_args_list[0].args[1]
        assert list(entity_arg.measures) == []

    def test_future_entity_carries_same_filter(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_module_helpers(monkeypatch)
        present = _build_entity(["m_levee", "m_drainage", "m_pumps"])
        future = _build_entity(["m_levee", "m_drainage", "m_pumps"])
        strategy = _FixedLoadStrategy(present, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.entity_handler.get_future_entity = MagicMock(return_value=future)
        runner.request_data = _make_request_data(
            scenario="rcp85",
            selected_measure_ids=["m_levee"],
        )
        self._run(runner, strategy)

        # The cost-benefit call carries the filtered present entity; the
        # downstream waterfall call should see a future entity filtered to
        # the same set (CLIMADA invariant).
        waterfall_args = runner.costben_handler.compute_waterfall_data.call_args
        future_arg = waterfall_args.args[4]
        assert [m.name for m in future_arg.measures] == ["m_levee"]


class TestCacheKey:
    def test_different_selection_yields_different_key(self) -> None:
        from backend.db import cache_store

        base = dict(
            country="Thailand",
            hazard_type="flood",
            scenario="historical",
            exposure_type="crops",
            ref_year=2020,
            future_year=2050,
            annual_growth=0.02,
            entity_sha256="a" * 64,
            hazard_sha256="b" * 64,
        )
        without = cache_store.derive_cache_key(**base, selected_measure_ids=None)
        all_three = cache_store.derive_cache_key(
            **base, selected_measure_ids=["m_levee", "m_drainage", "m_pumps"]
        )
        subset = cache_store.derive_cache_key(
            **base, selected_measure_ids=["m_levee", "m_drainage"]
        )
        # Three distinct keys: None / full / subset must never collide.
        assert without != all_three
        assert without != subset
        assert all_three != subset

    def test_selection_is_order_independent(self) -> None:
        from backend.db import cache_store

        base = dict(
            country="Thailand",
            hazard_type="flood",
            scenario="historical",
            exposure_type="crops",
            ref_year=2020,
            future_year=2050,
            annual_growth=0.02,
            entity_sha256="a" * 64,
            hazard_sha256="b" * 64,
        )
        forward = cache_store.derive_cache_key(
            **base, selected_measure_ids=["m_levee", "m_drainage"]
        )
        reversed_ = cache_store.derive_cache_key(
            **base, selected_measure_ids=["m_drainage", "m_levee"]
        )
        assert forward == reversed_
