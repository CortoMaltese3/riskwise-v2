"""Unit tests for :class:`EraDataStrategy`.

The ERA strategy resolves entity and hazard files by country + hazard code
via the ``*_handler.get_*_filename`` helpers. These tests assert the
strategy calls the right helpers with the right arguments and propagates
their results — mirroring the pre-refactor ``_run_era_scenario`` data
loading lines without pulling in the CLIMADA compute stack.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import numpy as np
import pytest

from backend.engine.types import HazardArrays


def _hazard_arrays(intensity_unit: str = "") -> HazardArrays:
    return HazardArrays(
        intensity=np.zeros((1, 1)),
        frequency=np.array([1.0]),
        centroid_lat=np.array([0.0]),
        centroid_lon=np.array([0.0]),
        haz_type="FL",
        intensity_unit=intensity_unit,
    )


@pytest.fixture
def request_data():
    return SimpleNamespace(
        country_code="THA",
        country_name="Thailand",
        hazard_code="FL",
        hazard_type="flood",
        exposure_type="crops",
        scenario="rcp45",
        time_horizon=(2024, 2050),
        entity_filename="",
        hazard_filename="",
    )


@pytest.fixture
def strategy():
    from backend.scenario.strategy import EraDataStrategy

    return EraDataStrategy()


class TestEraLoadEntityAndExposure:
    def test_resolves_filename_from_country_hazard_and_exposure(
        self, strategy, request_data
    ) -> None:
        entity_handler = MagicMock()
        entity_handler.get_entity_filename.return_value = "thailand_crops.xlsx"
        fake_entity = SimpleNamespace(exposures=object())
        entity_handler.get_entity_from_xlsx.return_value = fake_entity

        entity, exposure = strategy.load_entity_and_exposure(
            request_data, entity_handler, MagicMock()
        )

        entity_handler.get_entity_filename.assert_called_once_with("THA", "FL", "crops")
        entity_handler.get_entity_from_xlsx.assert_called_once_with("thailand_crops.xlsx")
        assert entity is fake_entity
        assert exposure is fake_entity.exposures

    def test_does_not_call_exposure_handler(self, strategy, request_data) -> None:
        """ERA reads everything from local seed files; the exposure handler stays untouched."""
        entity_handler = MagicMock()
        entity_handler.get_entity_from_xlsx.return_value = SimpleNamespace(exposures=object())
        exposure_handler = MagicMock()

        strategy.load_entity_and_exposure(request_data, entity_handler, exposure_handler)

        assert exposure_handler.method_calls == []


class TestEraLoadHazardPresent:
    def test_loads_historical_file_and_sets_intensity_unit(self, strategy, request_data) -> None:
        hazard_handler = MagicMock()
        hazard_handler.get_hazard_filename.return_value = "tha_fl_hist.h5"
        hazard_handler.get_hazard.return_value = _hazard_arrays()

        result = strategy.load_hazard_present(request_data, hazard_handler, "m")

        hazard_handler.get_hazard_filename.assert_called_once_with("FL", "THA", "historical")
        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="tha_fl_hist.h5",
        )
        assert isinstance(result, HazardArrays)
        assert result.intensity_unit == "m"


class TestEraLoadHazardFuture:
    def test_loads_scenario_keyed_file_and_sets_intensity_unit(
        self, strategy, request_data
    ) -> None:
        hazard_handler = MagicMock()
        hazard_handler.get_hazard_filename.return_value = "tha_fl_rcp45.h5"
        hazard_handler.get_hazard.return_value = _hazard_arrays()

        result = strategy.load_hazard_future(request_data, hazard_handler, "m")

        hazard_handler.get_hazard_filename.assert_called_once_with("FL", "THA", "rcp45")
        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="tha_fl_rcp45.h5",
        )
        assert isinstance(result, HazardArrays)
        assert result.intensity_unit == "m"
