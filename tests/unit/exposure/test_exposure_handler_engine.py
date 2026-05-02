"""Engine-backend tests for ``ExposureHandler``.

Verifies that the engine backend (default after #164) returns a
``climate_lama_engine.Exposures`` whose value/lat/lon arrays match the
CLIMADA path's equivalent, while ``RISKWISE_ENGINE_BACKEND="climada"``
keeps the legacy ``climada.entity.Exposures`` output as a diagnostic
escape hatch. Also pins ``get_growth_exposure`` so both branches apply
the same ``(1 + annual_growth) ** (future_year - ref_year)`` multiplier.

Skipped when the real CLIMADA package is not installed (stub
environment / CI without the full geospatial stack).
``pytest.importorskip`` with ``minversion`` distinguishes the real
package from the conftest stubs, which have no ``__version__``.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

# Require the real CLIMADA (not the conftest stub, which has no __version__).
pytest.importorskip("climada", minversion="1.0")
pytest.importorskip("climate_lama_engine")

import climate_lama_engine as cc  # noqa: E402
from climada.entity import Exposures as ClimadaExposures  # noqa: E402

from backend.exposure.exposure_handler import ExposureHandler  # noqa: E402

FIXTURES = Path(__file__).parents[2] / "fixtures" / "entities"
EGY_XLSX = FIXTURES / "egy_economic_present.xlsx"


def _xlsx_available() -> bool:
    return EGY_XLSX.is_file()


pytestmark = pytest.mark.skipif(
    not _xlsx_available(),
    reason=f"Entity fixture {EGY_XLSX.name} not present in tests/fixtures/entities/",
)


class TestEngineBackendRouting:
    """``get_exposure`` returns the right type for each ``RISKWISE_ENGINE_BACKEND`` value."""

    def test_engine_backend_returns_cc_exposures(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        exposure = ExposureHandler().get_exposure(EGY_XLSX)
        assert isinstance(exposure, cc.Exposures)
        assert exposure.value.size > 0

    def test_climada_backend_returns_climada_exposures(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        exposure = ExposureHandler().get_exposure(EGY_XLSX)
        assert isinstance(exposure, ClimadaExposures)


class TestEngineClimadaArrayParity:
    """Engine-path arrays match the CLIMADA path's value/lat/lon for the same fixture."""

    @pytest.fixture(autouse=True)
    def _exposures(self, monkeypatch):
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        self._climada = ExposureHandler().get_exposure(EGY_XLSX)

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        self._engine = ExposureHandler().get_exposure(EGY_XLSX)

    def _climada_arrays(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        gdf = self._climada.gdf
        values = gdf["value"].to_numpy(dtype=np.float64)
        if "latitude" in gdf.columns and "longitude" in gdf.columns:
            lat = gdf["latitude"].to_numpy(dtype=np.float64)
            lon = gdf["longitude"].to_numpy(dtype=np.float64)
        else:
            lat = gdf.geometry.y.to_numpy(dtype=np.float64)
            lon = gdf.geometry.x.to_numpy(dtype=np.float64)
        return values, lat, lon

    def test_value_arrays_match(self) -> None:
        values, _, _ = self._climada_arrays()
        np.testing.assert_allclose(self._engine.value, values, atol=1e-9, rtol=0)

    def test_lat_arrays_match(self) -> None:
        _, lat, _ = self._climada_arrays()
        np.testing.assert_allclose(self._engine.lat, lat, atol=1e-9, rtol=0)

    def test_lon_arrays_match(self) -> None:
        _, _, lon = self._climada_arrays()
        np.testing.assert_allclose(self._engine.lon, lon, atol=1e-9, rtol=0)


class TestGetGrowthExposure:
    """``get_growth_exposure`` applies ``(1+g)^(future-ref)`` identically on both branches."""

    ANNUAL_GROWTH = 0.02
    REF_YEAR = 2020
    FUTURE_YEAR = 2050

    @property
    def expected_multiplier(self) -> float:
        return (1 + self.ANNUAL_GROWTH) ** (self.FUTURE_YEAR - self.REF_YEAR)

    def test_climada_branch_multiplies_value(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        handler = ExposureHandler()
        baseline = handler.get_exposure(EGY_XLSX)
        baseline.ref_year = self.REF_YEAR
        original = baseline.gdf["value"].to_numpy(dtype=np.float64).copy()

        future = handler.get_growth_exposure(baseline, self.ANNUAL_GROWTH, self.FUTURE_YEAR)

        assert future is not None
        np.testing.assert_allclose(
            future.gdf["value"].to_numpy(dtype=np.float64),
            original * self.expected_multiplier,
            atol=1e-12,
            rtol=0,
        )
        assert future.ref_year == self.FUTURE_YEAR

    def test_engine_branch_multiplies_value(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        handler = ExposureHandler()
        baseline = handler.get_exposure(EGY_XLSX)
        original = np.asarray(baseline.value, dtype=np.float64).copy()

        future = handler.get_growth_exposure(
            baseline, self.ANNUAL_GROWTH, self.FUTURE_YEAR, ref_year=self.REF_YEAR
        )

        assert isinstance(future, cc.Exposures)
        np.testing.assert_allclose(
            future.value,
            original * self.expected_multiplier,
            atol=1e-12,
            rtol=0,
        )

    def test_branches_produce_matching_values(self, monkeypatch) -> None:
        """The two branches' multiplied value arrays match within 1e-12."""
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        handler = ExposureHandler()
        climada_base = handler.get_exposure(EGY_XLSX)
        climada_base.ref_year = self.REF_YEAR
        climada_future = handler.get_growth_exposure(
            climada_base, self.ANNUAL_GROWTH, self.FUTURE_YEAR
        )
        climada_values = climada_future.gdf["value"].to_numpy(dtype=np.float64)

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        engine_base = handler.get_exposure(EGY_XLSX)
        engine_future = handler.get_growth_exposure(
            engine_base, self.ANNUAL_GROWTH, self.FUTURE_YEAR, ref_year=self.REF_YEAR
        )

        np.testing.assert_allclose(engine_future.value, climada_values, atol=1e-12, rtol=0)
