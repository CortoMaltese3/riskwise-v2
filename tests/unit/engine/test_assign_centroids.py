"""Tests for ``backend.engine.adapter.assign_centroids``.

The helper replaces :class:`ExposureArrays.centroid_idx` with the
nearest-neighbor index against a hazard's centroid grid. We verify
identity mapping, off-grid lookup, and great-circle correctness.
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.engine.adapter import assign_centroids
from backend.engine.types import ExposureArrays, HazardArrays


def _hazard(lat: list[float], lon: list[float]) -> HazardArrays:
    return HazardArrays(
        intensity=np.zeros((1, len(lat))),
        frequency=np.array([1.0]),
        centroid_lat=np.asarray(lat, dtype=np.float64),
        centroid_lon=np.asarray(lon, dtype=np.float64),
    )


def _exposure(lat: list[float], lon: list[float]) -> ExposureArrays:
    n = len(lat)
    return ExposureArrays(
        values=np.ones(n),
        centroid_idx=np.arange(n),
        impf_id=np.ones(n, dtype=np.int64),
        lat=np.asarray(lat, dtype=np.float64),
        lon=np.asarray(lon, dtype=np.float64),
    )


def test_identity_mapping_when_grids_align() -> None:
    haz = _hazard([0.0, 1.0, 2.0], [10.0, 11.0, 12.0])
    exp = _exposure([0.0, 1.0, 2.0], [10.0, 11.0, 12.0])
    out = assign_centroids(exp, haz)
    np.testing.assert_array_equal(out.centroid_idx, np.array([0, 1, 2]))


def test_offset_points_pick_nearest_centroid() -> None:
    # Hazard centroids on a coarse grid; exposure points perturbed slightly toward
    # specific centroids — assert nearest-neighbor selection is what we expect.
    haz = _hazard([0.0, 0.0, 1.0, 1.0], [0.0, 1.0, 0.0, 1.0])
    exp = _exposure([0.01, 0.99, 0.49, 0.51], [0.01, 0.99, 0.01, 0.99])
    out = assign_centroids(exp, haz)
    # (0.01, 0.01) → idx 0; (0.99, 0.99) → idx 3; (0.49, 0.01) → idx 0; (0.51, 0.99) → idx 3
    np.testing.assert_array_equal(out.centroid_idx, np.array([0, 3, 0, 3]))


def test_great_circle_correctness_at_dateline() -> None:
    # An exposure point at lon=179.5 should map to a hazard centroid at lon=-179
    # (great-circle distance ~1.5°), not to lon=170 (~9.5°). A naive Euclidean
    # search on raw degrees would prefer lon=170 — this test pins the behaviour.
    haz = _hazard([0.0, 0.0], [170.0, -179.0])
    exp = _exposure([0.0], [179.5])
    out = assign_centroids(exp, haz)
    np.testing.assert_array_equal(out.centroid_idx, np.array([1]))


def test_dtype_is_intp() -> None:
    haz = _hazard([0.0], [0.0])
    exp = _exposure([0.0], [0.0])
    out = assign_centroids(exp, haz)
    assert out.centroid_idx.dtype == np.intp


def test_returns_new_instance_input_unchanged() -> None:
    haz = _hazard([0.0, 1.0], [0.0, 1.0])
    exp = _exposure([1.0, 0.0], [1.0, 0.0])  # shuffled
    original_idx = exp.centroid_idx.copy()
    out = assign_centroids(exp, haz)
    assert out is not exp
    np.testing.assert_array_equal(exp.centroid_idx, original_idx)
    np.testing.assert_array_equal(out.centroid_idx, np.array([1, 0]))


def test_raises_when_lat_or_lon_missing() -> None:
    haz = _hazard([0.0], [0.0])
    exp = ExposureArrays(
        values=np.ones(1),
        centroid_idx=np.array([0]),
        impf_id=np.array([1]),
    )
    with pytest.raises(ValueError, match="lat and .lon"):
        assign_centroids(exp, haz)
