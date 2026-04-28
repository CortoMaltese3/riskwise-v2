"""Engine-backend tests for ``HazardHandler.get_hazard``.

Verifies that ``RISKWISE_ENGINE_BACKEND="engine"`` swaps the production
side of ``get_hazard`` to the engine adapter — returning a
``climate_lama_engine.Hazard`` whose array shapes match the CLIMADA
path's equivalent — while ``RISKWISE_ENGINE_BACKEND="climada"`` (the
default) preserves the legacy ``climada.hazard.Hazard`` output.

Skipped when the real CLIMADA package is not installed (stub
environment / CI without the full geospatial stack).
``pytest.importorskip`` with ``minversion`` distinguishes the real
package from the conftest stubs, which have no ``__version__``.
"""

from __future__ import annotations

import pytest

# Require the real CLIMADA (not the conftest stub, which has no __version__).
pytest.importorskip("climada", minversion="1.0")
pytest.importorskip("climate_lama_engine")
pytest.importorskip("rasterio")

import climate_lama_engine as cc  # noqa: E402
from climada.hazard import Hazard as ClimadaHazard  # noqa: E402
from constants import DATA_HAZARDS_DIR  # noqa: E402
from hazard.hazard_handler import HazardHandler  # noqa: E402

_FLOOD_FILE = "hazard_FL_EGY_historical.tif"


def _flood_file_available() -> bool:
    return (DATA_HAZARDS_DIR / _FLOOD_FILE).is_file()


pytestmark = pytest.mark.skipif(
    not _flood_file_available(),
    reason=f"Flood raster fixture {_FLOOD_FILE} not present in data/hazards/",
)


class TestEngineBackendRouting:
    """``get_hazard`` returns the right type for each ``RISKWISE_ENGINE_BACKEND`` value."""

    def test_engine_backend_returns_cc_hazard(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        haz = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)
        assert isinstance(haz, cc.Hazard)
        assert haz.haz_type == "FL"
        assert haz.n_events > 0

    def test_climada_backend_returns_climada_hazard(self, monkeypatch) -> None:
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        haz = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)
        assert isinstance(haz, ClimadaHazard)
        assert haz.haz_type == "FL"


class TestEngineClimadaShapeParity:
    """Engine-path arrays match the CLIMADA path's shapes for the same fixture."""

    @pytest.fixture(autouse=True)
    def _hazards(self, monkeypatch):
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        self._climada = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        self._engine = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)

    def test_n_events_match(self) -> None:
        assert self._engine.n_events == self._climada.size

    def test_intensity_shape_matches(self) -> None:
        assert self._engine.intensity.shape == self._climada.intensity.shape

    def test_frequency_shape_matches(self) -> None:
        assert self._engine.frequency.shape == self._climada.frequency.shape
