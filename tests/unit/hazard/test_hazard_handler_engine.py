"""Engine-backend tests for ``HazardHandler.get_hazard``.

After #166 CLIMADA is removed entirely; the engine path is the only path.
``HazardHandler.get_hazard`` returns a ``climate_lama_engine.Hazard``.
"""

from __future__ import annotations

import pytest

pytest.importorskip("climate_lama_engine")
pytest.importorskip("rasterio")

import climate_lama_engine as cc  # noqa: E402

from backend.constants import DATA_HAZARDS_DIR  # noqa: E402
from backend.hazard.hazard_handler import HazardHandler  # noqa: E402

_FLOOD_FILE = "hazard_FL_EGY_historical.tif"


def _flood_file_available() -> bool:
    return (DATA_HAZARDS_DIR / _FLOOD_FILE).is_file()


pytestmark = pytest.mark.skipif(
    not _flood_file_available(),
    reason=f"Flood raster fixture {_FLOOD_FILE} not present in data/hazards/",
)


def test_engine_backend_returns_cc_hazard() -> None:
    haz = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)
    assert isinstance(haz, cc.Hazard)
    assert haz.haz_type == "FL"
    assert haz.n_events > 0
