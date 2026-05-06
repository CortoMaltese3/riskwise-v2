"""Engine-backend tests for ``HazardHandler.get_hazard``.

After Phase 6 closeout (#293) ``HazardHandler.get_hazard`` returns a
:class:`backend.engine.types.HazardArrays` — the riskwise-side domain
dataclass — rather than a ``climate_lama_engine.Hazard``. The engine
``Hazard`` is built at the boundary inside the impact / cost-benefit
handlers via ``backend.engine.adapter.build_hazard``.
"""

from __future__ import annotations

import pytest

pytest.importorskip("rasterio")

from backend.constants import DATA_HAZARDS_DIR  # noqa: E402
from backend.engine.types import HazardArrays  # noqa: E402
from backend.hazard.hazard_handler import HazardHandler  # noqa: E402

_FLOOD_FILE = "hazard_FL_EGY_historical.tif"


def _flood_file_available() -> bool:
    return (DATA_HAZARDS_DIR / _FLOOD_FILE).is_file()


pytestmark = pytest.mark.skipif(
    not _flood_file_available(),
    reason=f"Flood raster fixture {_FLOOD_FILE} not present in data/hazards/",
)


def test_engine_backend_returns_hazard_arrays() -> None:
    haz = HazardHandler().get_hazard("flood", source="raster", filepath=_FLOOD_FILE)
    assert isinstance(haz, HazardArrays)
    assert haz.haz_type == "FL"
    assert len(haz.frequency) > 0
