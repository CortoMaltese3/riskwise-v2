"""Unit tests for the mass-conserving exposure reallocation helper.

Locks the two invariants that make the choropleth trustworthy for fine admin
levels: the national total is preserved (mass conservation) and admin units
smaller than the grid still get a value (completeness — no spurious zeros).
Covers both the area-weighted fallback and the population-weighted
(dasymetric) path.
"""

from __future__ import annotations

import numpy as np
import pytest

gpd = pytest.importorskip("geopandas")
pytest.importorskip("rasterio")
from shapely.geometry import box  # noqa: E402

from backend.utils.reallocation import (  # noqa: E402
    load_population_points,
    reallocate_values_to_admin,
)

# A 2x2 grid of unit cells: points at (0,0)/(1,0)/(0,1)/(1,1), each worth 100.
# Inferred cell size is 1.0deg, so each cell footprint is a 1x1 box. The whole
# grid spans the bbox [-0.5, 1.5] in both axes.
_LONS = np.array([0.0, 1.0, 0.0, 1.0])
_LATS = np.array([0.0, 0.0, 1.0, 1.0])
_VALUES = np.array([100.0, 100.0, 100.0, 100.0])

# Two polygons that split the (0,0) cell footprint vertically. ``pa`` (x in
# [-0.5, 0.2], width 0.7) contains the cell centroid; ``pb`` (x in [0.2, 0.5],
# width 0.3) does NOT — a plain point-in-polygon sum would leave it at 0.
_PA = box(-0.5, -0.5, 0.2, 0.5)
_PB = box(0.2, -0.5, 0.5, 0.5)


def _admin(*polys):
    return gpd.GeoDataFrame({"id": range(len(polys))}, geometry=list(polys), crs="EPSG:4326")


def test_area_full_coverage_conserves_total() -> None:
    admin = _admin(box(-0.5, -0.5, 1.5, 1.5))
    out = reallocate_values_to_admin(_LATS, _LONS, _VALUES, admin)
    assert out.sum() == pytest.approx(400.0)


def test_area_splits_subcell_polygons_by_area_no_zeros() -> None:
    admin = _admin(_PA, _PB)
    out = reallocate_values_to_admin(_LATS, _LONS, _VALUES, admin)
    # Only the (0,0) cell is covered (value 100), split 0.7 / 0.3 by width.
    assert out.sum() == pytest.approx(100.0)
    assert out[0] == pytest.approx(70.0, abs=1.0)
    assert out[1] == pytest.approx(30.0, abs=1.0)
    assert (out > 0).all()  # the centroid-less polygon is no longer zero


def _pop_points(tmp_path):
    """A 10x10 population raster over the (0,0) cell, pop concentrated in pb."""
    import rasterio
    from rasterio.transform import from_bounds

    n = 10
    transform = from_bounds(-0.5, -0.5, 0.5, 0.5, n, n)
    arr = np.ones((n, n), dtype="float32")  # pa side: low population
    arr[:, 7:] = 10.0  # columns with centre x in [0.2, 0.5] -> pb side: high pop
    path = tmp_path / "pop.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=n,
        width=n,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=-1.0,
    ) as dst:
        dst.write(arr, 1)
    return load_population_points(path)


def test_dasymetric_weights_by_population_no_zeros(tmp_path) -> None:
    admin = _admin(_PA, _PB)
    pop_points = _pop_points(tmp_path)
    out = reallocate_values_to_admin(_LATS, _LONS, _VALUES, admin, pop_points)
    # Mass conserved, both units non-zero, and the high-population pb unit gets
    # the larger share even though it is the smaller polygon (area would give it
    # only ~30).
    assert out.sum() == pytest.approx(100.0, abs=1e-6)
    assert (out > 0).all()
    assert out[1] > out[0]
    assert out[1] > 50.0
