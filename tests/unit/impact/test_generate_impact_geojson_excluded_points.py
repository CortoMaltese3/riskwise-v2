"""Regression test for the white-map bug.

After the engine migration, ``Impact.imp_mat`` is sized to the *valid*
exposure subset (``value > 0`` and finite, valid centroid index), but
``generate_impact_geojson`` was stacking it with the *full*
``exposure.lat`` / ``lon`` arrays. Any zero-value or NaN-value point
caused ``np.column_stack`` to raise a length-mismatch error which the
handler swallowed, producing no ``risks_geodata.json`` and the
"successful run, white map" symptom.

This test pins the contract between :func:`valid_exposure_mask` (used by
the handler) and the engine's :class:`ImpactCalc` filter — they must
agree on which exposure points get a column in ``imp_mat``. Otherwise
the handler would re-introduce the length mismatch the moment any
real-world exposure file ships a zero-value point.
"""

from __future__ import annotations

import numpy as np
import pytest

pytest.importorskip("climate_lama_engine")
pytest.importorskip("scipy")

from scipy import sparse  # noqa: E402

from backend.engine.adapter import valid_exposure_mask  # noqa: E402
from backend.engine.types import (  # noqa: E402
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
)
from backend.impact.impact_handler import ImpactHandler  # noqa: E402


def _hazard_with_n_centroids(n: int) -> HazardArrays:
    n_events = 3
    intensity = np.full((n_events, n), 1.5)
    return HazardArrays(
        intensity=sparse.csr_matrix(intensity),
        frequency=np.array([0.1, 0.01, 0.002]),
        centroid_lat=np.linspace(30.0, 30.3, n),
        centroid_lon=np.linspace(31.0, 31.3, n),
        haz_type="FL",
        intensity_unit="m",
    )


def _impf_spec() -> ImpactFunctionSpec:
    return ImpactFunctionSpec(
        haz_type="FL",
        exp_type="generic",
        id=1,
        name="generic",
        intensity_unit="m",
        intensity=(0.0, 0.5, 1.0, 2.0, 3.0, 5.0),
        mdd=(0.0, 0.1, 0.3, 0.6, 0.8, 1.0),
        paa=(0.0, 0.5, 0.8, 1.0, 1.0, 1.0),
    )


def _exposure(values: list[float]) -> ExposureArrays:
    n = len(values)
    return ExposureArrays(
        values=np.asarray(values, dtype=np.float64),
        centroid_idx=np.arange(n, dtype=np.intp),
        impf_id=np.ones(n, dtype=np.int64),
        lat=np.linspace(30.0, 30.3, n),
        lon=np.linspace(31.0, 31.3, n),
        value_unit="USD",
    )


def test_mask_subsets_exposure_to_imp_mat_column_count() -> None:
    """The mask + lat/lon stack must agree with ``imp_mat`` column count.

    Without the fix, ``np.column_stack`` would raise on the unequal
    lengths and ``generate_impact_geojson`` would swallow the exception
    and never write the GeoJSON.
    """
    exposure = _exposure([100_000.0, 0.0, 300_000.0, 400_000.0])
    hazard = _hazard_with_n_centroids(4)

    impact = ImpactHandler().calculate_impact(exposure, hazard, [_impf_spec()])
    assert impact is not None
    assert impact.imp_mat.shape[1] == 3

    mask = valid_exposure_mask(exposure)
    assert int(mask.sum()) == impact.imp_mat.shape[1]

    # The actual stacking the handler performs — must not raise.
    lat = np.asarray(exposure.lat)[mask]
    lon = np.asarray(exposure.lon)[mask]
    coords = np.column_stack([lat, lon])
    rp_block = np.zeros((coords.shape[0], 2))  # stand-in for per-RP impact
    np.column_stack((coords, rp_block))


def test_mask_handles_nan_values() -> None:
    exposure = _exposure([100_000.0, float("nan"), 300_000.0])
    hazard = _hazard_with_n_centroids(3)

    impact = ImpactHandler().calculate_impact(exposure, hazard, [_impf_spec()])
    assert impact is not None

    mask = valid_exposure_mask(exposure)
    assert int(mask.sum()) == impact.imp_mat.shape[1]


def test_all_valid_keeps_full_length() -> None:
    exposure = _exposure([100_000.0, 200_000.0, 300_000.0])
    hazard = _hazard_with_n_centroids(3)

    impact = ImpactHandler().calculate_impact(exposure, hazard, [_impf_spec()])
    assert impact is not None
    assert impact.imp_mat.shape[1] == 3

    mask = valid_exposure_mask(exposure)
    np.testing.assert_array_equal(mask, [True, True, True])
