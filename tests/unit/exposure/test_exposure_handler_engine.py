"""Engine-backend tests for ``ExposureHandler``.

After #166 CLIMADA is removed entirely; the engine path is the only path.
This module pins the engine output shape and the ``get_growth_exposure``
multiplier on a real entity fixture.

Skipped when ``climate_lama_engine`` or the entity fixture are not available
(stub environment / CI without the full geospatial stack).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("climate_lama_engine")

import climate_lama_engine as cc  # noqa: E402

from backend.exposure.exposure_handler import ExposureHandler  # noqa: E402

FIXTURES = Path(__file__).parents[2] / "fixtures" / "entities"
EGY_XLSX = FIXTURES / "egy_economic_present.xlsx"


def _xlsx_available() -> bool:
    return EGY_XLSX.is_file()


pytestmark = pytest.mark.skipif(
    not _xlsx_available(),
    reason=f"Entity fixture {EGY_XLSX.name} not present in tests/fixtures/entities/",
)


class TestEngineBackend:
    """``get_exposure`` returns a ``cc.Exposures`` with non-empty arrays."""

    def test_returns_cc_exposures(self) -> None:
        exposure = ExposureHandler().get_exposure(EGY_XLSX)
        assert isinstance(exposure, cc.Exposures)
        assert exposure.value.size > 0


class TestGetGrowthExposure:
    """``get_growth_exposure`` applies ``(1+g)^(future-ref)`` to the value array."""

    ANNUAL_GROWTH = 0.02
    REF_YEAR = 2020
    FUTURE_YEAR = 2050

    @property
    def expected_multiplier(self) -> float:
        return (1 + self.ANNUAL_GROWTH) ** (self.FUTURE_YEAR - self.REF_YEAR)

    def test_engine_branch_multiplies_value(self) -> None:
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
