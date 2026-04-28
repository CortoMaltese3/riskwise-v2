"""Tests for :func:`backend.engine.loaders.raster.load_hazard_raster`.

Covers:

* RP-band mode against an explicit marginal-frequency reference and
  against ``climada.hazard.Hazard.from_raster`` (parity skipped when the
  real CLIMADA package is not importable).
* Flat-event mode (single-band) against the same CLIMADA reference.
* CRS reprojection: an ``EPSG:3857`` fixture's lat/lon arrives within
  ``1e-6`` degrees of the WGS84 reference grid.
* Error paths: file-not-found and band-count mismatch raise
  :class:`HazardLoadError` with the expected substring.

The flood TIF fixtures under ``tests/fixtures/hazards/`` are produced
by ``tests/fixtures/hazards/_make_flood_rasters.py`` (deterministic, ~1
KB each); regenerate via that script after a numpy/rasterio bump.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from scipy import sparse

from backend.engine.loaders import HazardLoadError, load_hazard_raster
from backend.engine.types import HazardArrays

FIXTURES = Path(__file__).parents[3] / "fixtures" / "hazards"
PRESENT = FIXTURES / "egy_flood_present_rp.tif"
FUTURE = FIXTURES / "egy_flood_future_rp.tif"
PRESENT_3857 = FIXTURES / "egy_flood_present_3857.tif"

RPS: list[int] = [10, 50, 100, 250]


def _expected_marginal(rps: list[int]) -> np.ndarray:
    """Replicate ``Hazard.from_rp_maps``'s RP→marginal math for assertion targets."""
    arr = np.asarray(rps, dtype=float)
    exc = 1.0 / arr
    sort_idx = np.argsort(arr)
    marginal = np.abs(np.diff(exc[sort_idx], append=0.0))
    return marginal[np.argsort(sort_idx)]


@pytest.fixture
def present_path() -> Path:
    if not PRESENT.is_file():
        pytest.skip(f"missing fixture: {PRESENT}")
    return PRESENT


@pytest.fixture
def future_path() -> Path:
    if not FUTURE.is_file():
        pytest.skip(f"missing fixture: {FUTURE}")
    return FUTURE


@pytest.fixture
def present_3857_path() -> Path:
    if not PRESENT_3857.is_file():
        pytest.skip(f"missing fixture: {PRESENT_3857}")
    return PRESENT_3857


# ---------------------------------------------------------------------------
# Structural checks on loader output
# ---------------------------------------------------------------------------


def test_rp_band_mode_returns_marginal_hazard_arrays(present_path: Path) -> None:
    arrays = load_hazard_raster(present_path, return_periods=RPS)

    assert isinstance(arrays, HazardArrays)
    assert isinstance(arrays.intensity, sparse.csr_matrix)
    assert arrays.intensity.shape == (len(RPS), 25)
    assert arrays.frequency.shape == (len(RPS),)
    assert arrays.centroid_lat.shape == (25,)
    assert arrays.centroid_lon.shape == (25,)
    assert arrays.frequency_type == "marginal"
    assert arrays.haz_type == "FL"
    assert arrays.intensity_unit == "m"
    np.testing.assert_allclose(arrays.frequency, _expected_marginal(RPS), atol=1e-9, rtol=0)


def test_rp_band_mode_works_for_future_fixture(future_path: Path) -> None:
    arrays = load_hazard_raster(future_path, return_periods=RPS)

    assert arrays.frequency_type == "marginal"
    assert arrays.intensity.shape == (len(RPS), 25)
    np.testing.assert_allclose(arrays.frequency, _expected_marginal(RPS), atol=1e-9, rtol=0)


def test_flat_event_mode_returns_occurrence_with_equal_weights(present_path: Path) -> None:
    arrays = load_hazard_raster(present_path)

    assert arrays.frequency_type == "occurrence"
    assert arrays.intensity.shape == (4, 25)
    np.testing.assert_allclose(arrays.frequency, np.full(4, 0.25), atol=1e-12, rtol=0)


# ---------------------------------------------------------------------------
# Parity vs CLIMADA's own raster loader
# ---------------------------------------------------------------------------


def _climada_hazard(path: Path, *, frequency: np.ndarray, haz_type: str = "FL"):
    """Load via CLIMADA's ``Hazard.from_raster`` for parity comparison.

    ``tests/unit/conftest.py`` stubs ``climada.hazard`` when the real
    package is not installed; the ``hasattr(..., "from_raster")`` guard
    ensures we don't run against the stub.
    """
    hazard_mod = pytest.importorskip("climada.hazard")
    if not hasattr(hazard_mod.Hazard, "from_raster"):
        pytest.skip("climada is stubbed — real package not installed")
    bands = list(range(1, len(frequency) + 1))
    return hazard_mod.Hazard.from_raster(
        str(path),
        attrs={
            "frequency": np.asarray(frequency, dtype=float),
            "event_id": np.asarray(bands, dtype=int),
            "units": "m",
        },
        haz_type=haz_type,
        band=bands,
    )


def test_climada_parity_rp_band(present_path: Path) -> None:
    arrays = load_hazard_raster(present_path, return_periods=RPS)
    haz = _climada_hazard(present_path, frequency=arrays.frequency)

    assert arrays.intensity.shape == haz.intensity.shape
    np.testing.assert_array_equal(arrays.intensity.toarray(), haz.intensity.toarray())
    np.testing.assert_allclose(arrays.frequency, haz.frequency, atol=1e-9, rtol=0)
    np.testing.assert_allclose(arrays.centroid_lat, haz.centroids.lat, atol=1e-9, rtol=0)
    np.testing.assert_allclose(arrays.centroid_lon, haz.centroids.lon, atol=1e-9, rtol=0)


def test_climada_parity_flat_event(present_path: Path) -> None:
    """Single-band parity. We slice band 1 of the multi-band fixture."""
    with rasterio.open(present_path) as ds:
        single = ds.read(1)
        profile = ds.profile
    profile.update(count=1)
    tmp = present_path.with_name("_single_band_for_test.tif")
    try:
        with rasterio.open(tmp, "w", **profile) as ds:
            ds.write(single, 1)
        arrays = load_hazard_raster(tmp)
        haz = _climada_hazard(tmp, frequency=arrays.frequency)

        assert arrays.intensity.shape == haz.intensity.shape
        np.testing.assert_array_equal(arrays.intensity.toarray(), haz.intensity.toarray())
        np.testing.assert_allclose(arrays.frequency, haz.frequency, atol=1e-9, rtol=0)
        np.testing.assert_allclose(arrays.centroid_lat, haz.centroids.lat, atol=1e-9, rtol=0)
        np.testing.assert_allclose(arrays.centroid_lon, haz.centroids.lon, atol=1e-9, rtol=0)
    finally:
        tmp.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# CRS edge case
# ---------------------------------------------------------------------------


def test_non_wgs84_crs_is_reprojected(present_3857_path: Path) -> None:
    """Loader output equals a hand-rolled pyproj reprojection of the fixture.

    A regular ``EPSG:3857`` GeoTIFF cannot land its pixel centers on a
    uniform WGS84 lat/lon grid because Mercator stretches latitude — so
    we pin the reprojection against an independent ``pyproj`` call on
    the same pixel centers, not against the WGS84 fixture.
    """
    arrays = load_hazard_raster(present_3857_path, return_periods=RPS)

    with rasterio.open(present_3857_path) as ds:
        rows, cols = np.meshgrid(np.arange(ds.height), np.arange(ds.width), indexing="ij")
        xs, ys = rasterio.transform.xy(ds.transform, rows.flatten(), cols.flatten())
        crs = ds.crs
    transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    expected_lon, expected_lat = transformer.transform(np.asarray(xs), np.asarray(ys))

    np.testing.assert_allclose(arrays.centroid_lat, expected_lat, atol=1e-6, rtol=0)
    np.testing.assert_allclose(arrays.centroid_lon, expected_lon, atol=1e-6, rtol=0)
    # Sanity: values must be in degree range, not raw Mercator metres.
    assert np.all(np.abs(arrays.centroid_lat) < 90)
    assert np.all(np.abs(arrays.centroid_lon) < 180)


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_missing_file_raises_with_path(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist.tif"
    with pytest.raises(HazardLoadError, match=re.escape(str(missing))):
        load_hazard_raster(missing)


def test_bad_band_count_raises(present_path: Path) -> None:
    with pytest.raises(HazardLoadError, match="Bad band count"):
        load_hazard_raster(present_path, return_periods=[10, 50])
