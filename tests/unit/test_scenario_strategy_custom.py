"""Unit tests for :class:`CustomDataStrategy`.

The custom strategy has four entry points that differ by whether the user
uploaded an entity file and whether the user uploaded a hazard file. The
no-upload branches raise ``ValueError`` directing the user to the
custom-data import flow; this matrix covers both the upload paths and the
fail-loudly paths.
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
    from backend.scenario_strategy import CustomDataStrategy

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

    def test_without_entity_file_raises_missing_upload(self, strategy) -> None:
        """No-upload branch fails loudly instead of triggering an online fetch."""
        request_data = _request_data(entity_filename="")
        entity_handler = MagicMock()
        exposure_handler = MagicMock()

        with pytest.raises(ValueError, match="custom-data import flow"):
            strategy.load_entity_and_exposure(request_data, entity_handler, exposure_handler)

        entity_handler.get_entity_from_xlsx.assert_not_called()


class TestCustomLoadHazardPresent:
    def test_historical_with_uploaded_file_uses_that_file(
        self, strategy, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from backend import scenario_strategy

        monkeypatch.setattr(scenario_strategy, "check_file_type", lambda _path: "raster")
        request_data = _request_data(
            scenario="historical",
            hazard_filename="user_hist.tif",
        )
        hazard_handler = MagicMock()
        hazard_handler.get_hazard.return_value = _hazard_arrays()

        result = strategy.load_hazard_present(request_data, hazard_handler, "mm")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="user_hist.tif",
            source="raster",
        )
        assert isinstance(result, HazardArrays)
        assert result.intensity_unit == "mm"

    def test_future_with_uploaded_file_falls_back_to_era_historical(
        self, strategy, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """When the user uploads only a future hazard file, the historical
        hazard is resolved from the ERA seed for that country — matching
        pre-refactor behaviour."""
        from backend import scenario_strategy

        monkeypatch.setattr(scenario_strategy, "check_file_type", lambda _path: "raster")
        request_data = _request_data(
            scenario="rcp85",
            hazard_filename="user_future.tif",
        )
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

    def test_without_hazard_file_raises_missing_upload(self, strategy) -> None:
        """No-upload branch fails loudly instead of triggering an online fetch."""
        request_data = _request_data(scenario="rcp45", hazard_filename="")
        hazard_handler = MagicMock()

        with pytest.raises(ValueError, match="custom-data import flow"):
            strategy.load_hazard_present(request_data, hazard_handler, "m")

        hazard_handler.get_hazard.assert_not_called()


class TestCustomLoadHazardFuture:
    def test_with_uploaded_file_loads_future_from_user_file(
        self, strategy, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from backend import scenario_strategy

        monkeypatch.setattr(scenario_strategy, "check_file_type", lambda _path: "hdf5")
        request_data = _request_data(
            scenario="rcp85",
            hazard_filename="user_future.h5",
        )
        hazard_handler = MagicMock()
        hazard_handler.get_hazard.return_value = _hazard_arrays()

        result = strategy.load_hazard_future(request_data, hazard_handler, "m")

        hazard_handler.get_hazard.assert_called_once_with(
            hazard_type="flood",
            filepath="user_future.h5",
            source="hdf5",
        )
        assert isinstance(result, HazardArrays)
        assert result.intensity_unit == "m"

    def test_without_uploaded_file_raises_missing_upload(self, strategy) -> None:
        """No-upload branch fails loudly instead of triggering an online fetch."""
        request_data = _request_data(scenario="rcp85", hazard_filename="")
        hazard_handler = MagicMock()

        with pytest.raises(ValueError, match="custom-data import flow"):
            strategy.load_hazard_future(request_data, hazard_handler, "m")

        hazard_handler.get_hazard.assert_not_called()


class TestMakeStrategy:
    def test_era_flag_returns_era_strategy(self) -> None:
        from backend.scenario_strategy import CustomDataStrategy, EraDataStrategy, make_strategy

        assert isinstance(make_strategy(is_era=True), EraDataStrategy)
        assert isinstance(make_strategy(is_era=False), CustomDataStrategy)
