"""Tests for :func:`backend.engine.loaders.hdf5.load_hazard_h5`.

Covers:

* Loader-output structure and dtype on the two reference fixtures.
* Byte-for-byte parity against ``climada.hazard.Hazard.from_hdf5`` on
  the same fixtures (skipped when CLIMADA is not importable).
* Each error path (missing file, missing dataset, shape mismatch).

Fixtures under ``tests/fixtures/hazards/`` are unmodified copies of the
present-day production files under ``data/hazards/``. The drought
fixture uses Thailand because the production catalogue has no Egypt
drought file.
"""

from __future__ import annotations

import re
from pathlib import Path

import h5py
import numpy as np
import pytest
from scipy import sparse

from backend.engine.loaders import HazardLoadError, load_hazard_h5
from backend.engine.types import HazardArrays

FIXTURES = Path(__file__).parents[3] / "fixtures" / "hazards"
HEATWAVE = FIXTURES / "egy_heatwave_present.h5"
DROUGHT = FIXTURES / "tha_drought_present.h5"


@pytest.fixture
def heatwave_path() -> Path:
    if not HEATWAVE.is_file():
        pytest.skip(f"missing fixture: {HEATWAVE}")
    return HEATWAVE


@pytest.fixture
def drought_path() -> Path:
    if not DROUGHT.is_file():
        pytest.skip(f"missing fixture: {DROUGHT}")
    return DROUGHT


# ---------------------------------------------------------------------------
# Structural checks on the loader output
# ---------------------------------------------------------------------------


def test_load_heatwave_returns_hazard_arrays(heatwave_path: Path) -> None:
    arrays = load_hazard_h5(heatwave_path)

    assert isinstance(arrays, HazardArrays)
    assert isinstance(arrays.intensity, sparse.csr_matrix)
    assert arrays.intensity.shape[0] == arrays.frequency.shape[0]
    assert arrays.intensity.shape[1] == arrays.centroid_lat.shape[0]
    assert arrays.intensity.shape[1] == arrays.centroid_lon.shape[0]
    assert arrays.haz_type == "HW"
    assert arrays.intensity_unit == "no unit"
    assert arrays.event_names is not None
    assert arrays.event_names[0].startswith("Egypt")


def test_load_drought_derives_centroids_from_raster_meta(drought_path: Path) -> None:
    """The Thailand drought file stores empty lat/lon; loader must derive them."""
    arrays = load_hazard_h5(drought_path)

    assert arrays.centroid_lat.shape[0] == arrays.intensity.shape[1]
    assert arrays.centroid_lon.shape[0] == arrays.intensity.shape[1]
    assert np.isfinite(arrays.centroid_lat).all()
    assert np.isfinite(arrays.centroid_lon).all()


# ---------------------------------------------------------------------------
# Parity vs CLIMADA's own loader
# ---------------------------------------------------------------------------


def _climada_hazard(path: Path):
    # ``tests/unit/conftest.py`` stubs ``climada.hazard.Hazard`` when the real
    # package is not installed. ``importorskip`` would not trip on the stub,
    # so we additionally check for the real ``from_hdf5`` classmethod.
    hazard_mod = pytest.importorskip("climada.hazard")
    if not hasattr(hazard_mod.Hazard, "from_hdf5"):
        pytest.skip("climada is stubbed — real package not installed")
    haz = hazard_mod.Hazard.from_hdf5(str(path))
    if not haz.centroids.lat.size:
        haz.centroids.set_meta_to_lat_lon()
    return haz


@pytest.mark.parametrize(
    ("fixture_name", "path"),
    [("heatwave", HEATWAVE), ("drought", DROUGHT)],
)
def test_climada_parity(fixture_name: str, path: Path) -> None:
    if not path.is_file():
        pytest.skip(f"missing fixture: {path}")
    haz = _climada_hazard(path)
    arrays = load_hazard_h5(path)

    # Intensity: byte-equal in both shape and dense content. The CSR
    # backing storage may differ in dtype (CLIMADA preserves the on-disk
    # dtype; we use scipy defaults), so compare the dense form rather
    # than indices/data buffers directly.
    assert arrays.intensity.shape == haz.intensity.shape
    np.testing.assert_array_equal(arrays.intensity.toarray(), haz.intensity.toarray())

    np.testing.assert_allclose(arrays.frequency, haz.frequency, atol=1e-12, rtol=0)
    np.testing.assert_allclose(arrays.centroid_lat, haz.centroids.lat, atol=1e-12, rtol=0)
    np.testing.assert_allclose(arrays.centroid_lon, haz.centroids.lon, atol=1e-12, rtol=0)
    assert arrays.haz_type == haz.haz_type, fixture_name
    assert arrays.intensity_unit == haz.units, fixture_name


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_missing_file_raises_with_path(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist.h5"
    with pytest.raises(HazardLoadError, match=re.escape(str(missing))):
        load_hazard_h5(missing)


def test_missing_dataset_raises_with_dataset_name(tmp_path: Path) -> None:
    bad = tmp_path / "no_intensity.h5"
    with h5py.File(bad, "w") as hf:
        hf.create_dataset("frequency", data=np.array([0.1, 0.01]))
        cz = hf.create_group("centroids")
        cz.create_dataset("lat", data=np.array([1.0, 2.0]))
        cz.create_dataset("lon", data=np.array([1.0, 2.0]))

    with pytest.raises(HazardLoadError, match="intensity"):
        load_hazard_h5(bad)


def test_shape_mismatch_raises_with_shapes(tmp_path: Path) -> None:
    bad = tmp_path / "shape_mismatch.h5"
    intensity = sparse.csr_matrix(np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]))
    with h5py.File(bad, "w") as hf:
        ig = hf.create_group("intensity")
        ig.create_dataset("data", data=intensity.data)
        ig.create_dataset("indices", data=intensity.indices)
        ig.create_dataset("indptr", data=intensity.indptr)
        ig.attrs["shape"] = np.array(intensity.shape)
        hf.create_dataset("frequency", data=np.array([0.1, 0.01]))
        cz = hf.create_group("centroids")
        cz.create_dataset("lat", data=np.array([1.0, 2.0]))
        cz.create_dataset("lon", data=np.array([1.0, 2.0]))

    with pytest.raises(HazardLoadError, match=r"intensity \(3, 2\) vs frequency \(2,\)"):
        load_hazard_h5(bad)
