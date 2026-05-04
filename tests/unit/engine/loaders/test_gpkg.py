"""Tests for :func:`backend.engine.loaders.gpkg.load_exposures_gpkg`.

Covers:

* Loader-output structure on a synthetic point-exposure GeoPackage.
* Optional column handling (``deductible`` / ``cover`` / ``value_unit``).
* Geometry-derived lat/lon when no explicit columns are present.
* Error paths: file-not-found and missing required column raise
  :class:`EntityLoadError` with the expected substring.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pytest

geopandas = pytest.importorskip("geopandas")
shapely = pytest.importorskip("shapely")

from shapely.geometry import Point  # noqa: E402

from backend.engine.loaders import EntityLoadError, load_exposures_gpkg  # noqa: E402
from backend.engine.types import ExposureArrays  # noqa: E402


def _write_gpkg(
    path: Path,
    *,
    values: list[float],
    lats: list[float],
    lons: list[float],
    impf_col: str = "impf_FL",
    impf_ids: list[int] | None = None,
    extra: dict | None = None,
    drop_geometry: bool = False,
) -> Path:
    impf_ids = impf_ids if impf_ids is not None else [1] * len(values)
    rows: dict[str, list] = {
        "value": values,
        impf_col: impf_ids,
    }
    if extra:
        rows.update(extra)
    geometry = [Point(lon, lat) for lon, lat in zip(lons, lats, strict=True)]
    gdf = geopandas.GeoDataFrame(rows, geometry=geometry, crs="EPSG:4326")
    if drop_geometry:
        gdf = gdf.drop(columns=["geometry"])
    gdf.to_file(path, driver="GPKG")
    return path


def test_load_returns_exposure_arrays(tmp_path: Path) -> None:
    path = _write_gpkg(
        tmp_path / "exposure.gpkg",
        values=[10.0, 20.0, 30.0],
        lats=[30.1, 30.2, 30.3],
        lons=[31.1, 31.2, 31.3],
    )
    arrays = load_exposures_gpkg(path)

    assert isinstance(arrays, ExposureArrays)
    assert arrays.lat is not None
    assert arrays.lon is not None
    np.testing.assert_allclose(arrays.values, [10.0, 20.0, 30.0])
    np.testing.assert_allclose(arrays.lat, [30.1, 30.2, 30.3], atol=1e-9)
    np.testing.assert_allclose(arrays.lon, [31.1, 31.2, 31.3], atol=1e-9)
    np.testing.assert_array_equal(arrays.impf_id, [1, 1, 1])
    np.testing.assert_array_equal(arrays.centroid_idx, np.arange(3))
    assert arrays.deductible is None
    assert arrays.cover is None
    assert arrays.value_unit == "USD"


def test_load_picks_up_optional_columns(tmp_path: Path) -> None:
    path = _write_gpkg(
        tmp_path / "exposure_full.gpkg",
        values=[100.0, 200.0],
        lats=[10.0, 20.0],
        lons=[5.0, 6.0],
        extra={
            "deductible": [1.0, 2.0],
            "cover": [50.0, 60.0],
            "value_unit": ["EUR", "EUR"],
        },
    )
    arrays = load_exposures_gpkg(path)

    assert arrays.deductible is not None
    assert arrays.cover is not None
    np.testing.assert_allclose(arrays.deductible, [1.0, 2.0])
    np.testing.assert_allclose(arrays.cover, [50.0, 60.0])
    assert arrays.value_unit == "EUR"


def test_load_uses_explicit_lat_lon_columns(tmp_path: Path) -> None:
    """When explicit ``latitude`` / ``longitude`` columns exist, prefer them over geometry."""
    path = _write_gpkg(
        tmp_path / "exposure_explicit.gpkg",
        values=[1.0],
        lats=[0.0],
        lons=[0.0],
        extra={"latitude": [42.5], "longitude": [13.0]},
    )
    arrays = load_exposures_gpkg(path)

    assert arrays.lat is not None
    assert arrays.lon is not None
    np.testing.assert_allclose(arrays.lat, [42.5])
    np.testing.assert_allclose(arrays.lon, [13.0])


def test_missing_value_column_raises(tmp_path: Path) -> None:
    p = tmp_path / "no_value.gpkg"
    gdf = geopandas.GeoDataFrame(
        {"impf_FL": [1]},
        geometry=[Point(0.0, 0.0)],
        crs="EPSG:4326",
    )
    gdf.to_file(p, driver="GPKG")

    with pytest.raises(EntityLoadError, match=re.compile(r"required column 'value'")):
        load_exposures_gpkg(p)


def test_missing_impf_column_raises(tmp_path: Path) -> None:
    p = tmp_path / "no_impf.gpkg"
    gdf = geopandas.GeoDataFrame(
        {"value": [1.0]},
        geometry=[Point(0.0, 0.0)],
        crs="EPSG:4326",
    )
    gdf.to_file(p, driver="GPKG")

    with pytest.raises(EntityLoadError, match=re.compile(r"required column 'impf_'")):
        load_exposures_gpkg(p)


def test_file_not_found_raises(tmp_path: Path) -> None:
    with pytest.raises(EntityLoadError, match="not found"):
        load_exposures_gpkg(tmp_path / "missing.gpkg")
