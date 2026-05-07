"""Tests for ``backend.engine.adapter.valid_exposure_mask``.

The mask must mirror the engine's ``ImpactCalc.impact()`` filter exactly,
because handler code uses it to align per-point arrays (lat/lon) with
the columns of ``Impact.imp_mat`` — any drift would produce a length
mismatch when stacking and silently drop the impact GeoJSON.
"""

from __future__ import annotations

import numpy as np

from backend.engine.adapter import valid_exposure_mask
from backend.engine.types import ExposureArrays


def _exposure(values: list[float], centroid_idx: list[int] | None = None) -> ExposureArrays:
    n = len(values)
    if centroid_idx is None:
        centroid_idx = list(range(n))
    return ExposureArrays(
        values=np.asarray(values, dtype=np.float64),
        centroid_idx=np.asarray(centroid_idx, dtype=np.intp),
        impf_id=np.ones(n, dtype=np.int64),
        lat=np.zeros(n),
        lon=np.zeros(n),
    )


def test_excludes_zero_value_points() -> None:
    mask = valid_exposure_mask(_exposure([1.0, 0.0, 2.0]))
    np.testing.assert_array_equal(mask, [True, False, True])


def test_excludes_negative_value_points() -> None:
    mask = valid_exposure_mask(_exposure([1.0, -3.0, 2.0]))
    np.testing.assert_array_equal(mask, [True, False, True])


def test_excludes_nan_value_points() -> None:
    mask = valid_exposure_mask(_exposure([1.0, float("nan"), 2.0]))
    np.testing.assert_array_equal(mask, [True, False, True])


def test_excludes_negative_centroid_idx() -> None:
    mask = valid_exposure_mask(_exposure([1.0, 1.0, 1.0], centroid_idx=[0, -1, 2]))
    np.testing.assert_array_equal(mask, [True, False, True])


def test_all_valid_yields_all_true() -> None:
    mask = valid_exposure_mask(_exposure([1.0, 2.0, 3.0]))
    np.testing.assert_array_equal(mask, [True, True, True])
