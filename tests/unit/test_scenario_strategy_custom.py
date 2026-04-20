"""Unit tests for :class:`CustomDataStrategy`.

The custom strategy has four entry points that differ by whether the user
uploaded an entity file and whether the user uploaded a hazard file. This
test matrix covers all four branches for hazard loading and both branches
for entity loading. Behaviour mirrors the pre-refactor
``_run_custom_scenario`` data loading lines.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def _request_data(**overrides):
    base = dict(
        country_code="THA",
        country_name="Thailand",
        hazard_code="FL",
        hazard_type="flood",
        exposure_type="crops",
        scenario="historical",
        time_horizon=(2024, 2050),
        entity_filename="",
        hazard_filename="",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture
def strategy():
    from scenario_strategy import CustomDataStrategy

    return CustomDataStrategy()


class TestCustomLoadEntityAndExposure:
    def test_with_entity_file_loads_from_xlsx(self, strategy) -> None:
        request_data = _request_data(entity_filename="user_entity.xlsx")
        entity_handler = MagicMock()
        fake_entity = SimpleNamespace(exposures=object())
        entity_handler.get_entity_from_xlsx.return_value = fake_entity

        entity, exposure = strategy.load_entity_and_exposure(
            request_data, entity_handler, MagicMock()
        )

        entity_handler.get_entity_from_xlsx.assert_called_once_with("user_entity.xlsx")
        assert entity is fake_entity
        assert exposure is fake_entity.exposures

    def test_without_entity_file_fetches_exposure_from_api(self, strategy) -> None:
        request_data = _request_data(entity_filename="")
        entity_handler = MagicMock()
        exposure_handler = MagicMock()
        fake_exposure = object()
        exposure_handler.get_exposure_from_api.return_value = fake_exposure

        entity, exposure = strategy.load_entity_and_exposure(
            request_data, entity_handler, exposure_handler
        )

        entity_handler.get_entity_from_xlsx.assert_not_called()
        exposure_handler.get_exposure_from_api.assert_called_once_with("Thailand")
        assert entity is None
        assert exposure is fake_exposure


class TestCustomLoadHazardPresent:
    def test_historical_with_uploaded_file_uses_that_file(self, strategy) -> None:
        request_data = _request_data(
            scenario="historical",
            hazard_filename="user_hist.tif",
        )
        hazard_handler = MagicMock()
        base_handler = MagicMock()
        base_handler.check_file_type.return_value = "raster"
        fake_hazard = SimpleNamespace(units=None)
        hazard_handler.get_hazard.return_value = fake_hazard

        result = strategy.load_hazard_present(request_data, hazard_handler, base_handler, "mm")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="user_hist.tif",
            source="raster",
        )
        assert result is fake_hazard
        assert fake_hazard.units == "mm"

    def test_future_with_uploaded_file_falls_back_to_era_historical(self, strategy) -> None:
        """When the user uploads only a future hazard file, the historical
        hazard is resolved from the ERA seed for that country — matching
        pre-refactor behaviour."""
        request_data = _request_data(
            scenario="rcp85",
            hazard_filename="user_future.tif",
        )
        hazard_handler = MagicMock()
        hazard_handler.get_hazard_filename.return_value = "tha_fl_hist.h5"
        fake_hazard = SimpleNamespace(units=None)
        hazard_handler.get_hazard.return_value = fake_hazard

        result = strategy.load_hazard_present(request_data, hazard_handler, MagicMock(), "m")

        hazard_handler.get_hazard_filename.assert_called_once_with("FL", "THA", "historical")
        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="tha_fl_hist.h5",
        )
        assert result is fake_hazard
        assert fake_hazard.units == "m"

    def test_without_hazard_file_fetches_from_climada_api(self, strategy) -> None:
        request_data = _request_data(scenario="rcp45", hazard_filename="")
        hazard_handler = MagicMock()
        fake_hazard = SimpleNamespace(units=None)
        hazard_handler.get_hazard.return_value = fake_hazard

        result = strategy.load_hazard_present(request_data, hazard_handler, MagicMock(), "m")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            source="climada_api",
            scenario="rcp45",
            time_horizon=(2024, 2050),
            country="Thailand",
        )
        # API path does NOT overwrite units — preserved from pre-refactor code.
        assert fake_hazard.units is None
        assert result is fake_hazard


class TestCustomLoadHazardFuture:
    def test_with_uploaded_file_loads_future_from_user_file(self, strategy) -> None:
        request_data = _request_data(
            scenario="rcp85",
            hazard_filename="user_future.h5",
        )
        hazard_handler = MagicMock()
        base_handler = MagicMock()
        base_handler.check_file_type.return_value = "hdf5"
        fake_hazard = SimpleNamespace(units=None)
        hazard_handler.get_hazard.return_value = fake_hazard

        result = strategy.load_hazard_future(request_data, hazard_handler, base_handler, "m")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="user_future.h5",
            source="hdf5",
        )
        assert result is fake_hazard
        assert fake_hazard.units == "m"

    def test_without_uploaded_file_fetches_future_from_climada_api(self, strategy) -> None:
        request_data = _request_data(scenario="rcp85", hazard_filename="")
        hazard_handler = MagicMock()
        fake_hazard = SimpleNamespace(units=None)
        hazard_handler.get_hazard.return_value = fake_hazard

        result = strategy.load_hazard_future(request_data, hazard_handler, MagicMock(), "m")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            source="climada_api",
            scenario="rcp85",
            time_horizon=(2024, 2050),
            country="Thailand",
        )
        assert result is fake_hazard


class TestMakeStrategy:
    def test_era_flag_returns_era_strategy(self) -> None:
        from scenario_strategy import CustomDataStrategy, EraDataStrategy, make_strategy

        assert isinstance(make_strategy(is_era=True), EraDataStrategy)
        assert isinstance(make_strategy(is_era=False), CustomDataStrategy)
