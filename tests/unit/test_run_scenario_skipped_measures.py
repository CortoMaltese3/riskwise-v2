"""Backend filter accumulates names of skipped measures (issue #450).

``_filter_entity_measures`` returns the list of selected names that were
absent on the entity so the renderer can show the user which of their
picks the engine silently dropped. The accumulated list is surfaced as
``skippedMeasures`` on the scenario-run response ``data``.
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
    from backend.scenario.runner import RunScenario

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
    runner.skipped_measures = []
    runner._geojson = SimpleNamespace(generate=lambda *a, **kw: None)
    return runner


def _make_request_data(**overrides):
    from backend.scenario.request import RequestData

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
    from backend.scenario import runner

    monkeypatch.setattr(runner, "update_progress", MagicMock())
    monkeypatch.setattr(runner, "save_parquet_file", MagicMock())


def _build_entity(measure_names: list[str]) -> _StubEntity:
    return _StubEntity(
        exposures=MagicMock(name="exposures"),
        impfset_specs=[],
        measures=[_StubMeasure(name=n) for n in measure_names],
    )


def _run(runner, strategy) -> None:
    runner._resolve_return_periods = lambda: (10, 20, 50, 100)
    runner._resolve_hazard_intensity_unit = lambda _entity: "m"
    runner._get_average_annual_growth = lambda: 0.0
    runner._execute(strategy)


class TestFilterReturnsSkippedNames:
    def test_unknown_names_are_returned_as_skipped(self) -> None:
        from backend.scenario.request import _filter_entity_measures

        entity = _build_entity(["m_levee", "m_drainage"])
        logger = SimpleNamespace(warning=lambda *a, **k: None)
        _filtered, skipped = _filter_entity_measures(
            entity, ["m_levee", "m_does_not_exist"], logger
        )
        assert skipped == ["m_does_not_exist"]

    def test_no_filter_returns_empty_skipped_list(self) -> None:
        from backend.scenario.request import _filter_entity_measures

        entity = _build_entity(["m_levee"])
        logger = SimpleNamespace(warning=lambda *a, **k: None)
        _filtered, skipped = _filter_entity_measures(entity, [], logger)
        assert skipped == []

    def test_every_selection_known_returns_empty_skipped_list(self) -> None:
        from backend.scenario.request import _filter_entity_measures

        entity = _build_entity(["m_levee", "m_drainage"])
        logger = SimpleNamespace(warning=lambda *a, **k: None)
        _filtered, skipped = _filter_entity_measures(entity, ["m_levee", "m_drainage"], logger)
        assert skipped == []

    def test_all_unknown_filters_to_empty_and_skips_every_name(self) -> None:
        from backend.scenario.request import _filter_entity_measures

        entity = _build_entity(["m_levee"])
        logger = SimpleNamespace(warning=lambda *a, **k: None)
        filtered, skipped = _filter_entity_measures(entity, ["m_other_a", "m_other_b"], logger)
        assert list(filtered.measures) == []
        assert skipped == ["m_other_a", "m_other_b"]


class TestRunnerAccumulatesSkippedNames:
    def test_runner_stores_skipped_names_after_execute(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(
            selected_measure_ids=["m_levee", "m_does_not_exist"]
        )

        _run(runner, strategy)

        assert runner.skipped_measures == ["m_does_not_exist"]

    def test_runner_empty_skipped_when_every_name_matches(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _patch_module_helpers(monkeypatch)
        entity = _build_entity(["m_levee", "m_drainage"])
        strategy = _FixedLoadStrategy(entity, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.request_data = _make_request_data(selected_measure_ids=["m_levee", "m_drainage"])

        _run(runner, strategy)

        assert runner.skipped_measures == []

    def test_future_pass_does_not_duplicate_skipped_names(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Present + future pass share the same selection and same entity
        # measure schema, so the runner records the skip list once.
        _patch_module_helpers(monkeypatch)
        present = _build_entity(["m_levee"])
        future = _build_entity(["m_levee"])
        strategy = _FixedLoadStrategy(present, MagicMock(), MagicMock())
        runner = _make_runner()
        runner.entity_handler.get_future_entity = MagicMock(return_value=future)
        runner.request_data = _make_request_data(
            scenario="rcp85",
            selected_measure_ids=["m_levee", "m_phantom"],
        )

        _run(runner, strategy)

        assert runner.skipped_measures == ["m_phantom"]


class TestFetchMeasuresEntitySource:
    """The picker is entity-driven: ``load_entity_measures`` is the source.

    These tests pin the contract used by the ``/measures`` endpoint
    (in :mod:`backend.api.measures`): a missing file or failed load
    returns ``None`` so the endpoint falls back to the catalog; a
    successful load returns the entity's ``MeasureSpec`` list verbatim.
    """

    def test_entity_load_omitted_when_no_exposure_file(self) -> None:
        from backend.costben.measure_enrichment import load_entity_measures

        assert load_entity_measures(None) is None
        assert load_entity_measures("") is None

    def test_entity_load_returns_measure_specs_when_load_succeeds(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from backend.costben import measure_enrichment

        loaded_entity = SimpleNamespace(
            measures=[SimpleNamespace(name="m_levee"), SimpleNamespace(name="m_pumps")]
        )

        class _Stub:
            def get_entity_from_xlsx(self, _path):
                return loaded_entity

        monkeypatch.setattr(measure_enrichment, "EntityHandler", _Stub)
        result = measure_enrichment.load_entity_measures("entity.xlsx")
        assert [m.name for m in result] == ["m_levee", "m_pumps"]

    def test_entity_load_none_when_load_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.costben import measure_enrichment

        class _Stub:
            def get_entity_from_xlsx(self, _path):
                return None

        monkeypatch.setattr(measure_enrichment, "EntityHandler", _Stub)
        assert measure_enrichment.load_entity_measures("missing.xlsx") is None
