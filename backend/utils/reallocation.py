"""Mass-conserving reallocation of point exposure onto admin polygons.

The shipped exposures are a coarse (~4 km, 150 arcsec) LitPop grid of point
values. Aggregating them to administrative units with a plain point-in-polygon
sum has two failure modes that matter when the admin units are finer than the
grid (e.g. Greece's 326 ADM3 municipalities):

* **Spurious zeros** — a municipality smaller than the grid spacing may contain
  no grid centroid at all, so it sums to 0 even though it clearly holds assets
  (dense urban municipalities like Maroúsi or Kalamariá are the worst hit).
* **Coastal leakage** — grid centroids that fall just offshore are dropped, so
  their value disappears from the national total.

This module reallocates each grid cell's value onto the admin units its
footprint covers. When a fine population raster ships for the country
(``requirements/worldpop_<ISO3>.tif``) the split is weighted by the actual
population in each cell/unit overlap (dasymetric mapping); otherwise it falls
back to overlap area. Both variants are *mass-conserving* (the national total
is preserved up to fully-offshore cells) and *complete* (no admin unit with
nearby assets is left at 0).

The public entry point is :func:`reallocate_values_to_admin`. Callers that
aggregate several admin levels in a row should load the population points once
via :func:`load_population_points` and pass them in to avoid re-reading the
raster.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import box

from backend.constants import REQUIREMENTS_DIR
from backend.logging_config import get_logger

logger = get_logger("backend.utils.reallocation")

# World Cylindrical Equal Area — a country-agnostic equal-area CRS used for the
# area-overlap and nearest-neighbour steps (degree-space areas/distances are
# meaningless). Population weighting itself is unitless so it is CRS-free.
_EQUAL_AREA_EPSG = 6933


def population_raster_path(iso3: str) -> Path | None:
    """Return the WorldPop raster path for ``iso3`` if one ships, else ``None``.

    The presence of this file is what switches a country onto the
    population-weighted (dasymetric) reallocation; countries without it fall
    back to area weighting, and callers may keep the legacy point-in-polygon
    sum entirely.
    """
    path = REQUIREMENTS_DIR / f"worldpop_{iso3.upper()}.tif"
    return path if path.is_file() else None


def load_population_points(raster_path: Path) -> gpd.GeoDataFrame:
    """Load a population raster as a point GeoDataFrame (one point per pixel).

    Only strictly-positive pixels are kept; each carries its population count in
    a ``pop`` column and its pixel-centroid geometry in EPSG:4326.
    """
    import rasterio
    from rasterio.transform import xy

    with rasterio.open(raster_path) as src:
        band = src.read(1).astype("float64")
        nodata = src.nodata
        mask = band > 0
        if nodata is not None:
            mask &= band != nodata
        rows, cols = np.where(mask)
        xs, ys = xy(src.transform, rows, cols)
    return gpd.GeoDataFrame(
        {"pop": band[rows, cols]},
        geometry=gpd.points_from_xy(xs, ys, crs="EPSG:4326"),
    )


def _build_cells(lats: np.ndarray, lons: np.ndarray, values: np.ndarray) -> gpd.GeoDataFrame:
    """Wrap each grid point in its inferred square cell footprint."""
    ulon = np.unique(np.round(lons, 6))
    ulat = np.unique(np.round(lats, 6))
    dlon = float(np.median(np.diff(ulon))) if ulon.size > 1 else 0.0416667
    dlat = float(np.median(np.diff(ulat))) if ulat.size > 1 else 0.0416667
    hx, hy = dlon / 2.0, dlat / 2.0
    geom = [box(x - hx, y - hy, x + hx, y + hy) for x, y in zip(lons, lats, strict=True)]
    return gpd.GeoDataFrame(
        {"cell_id": np.arange(len(values)), "cell_value": values.astype("float64")},
        geometry=geom,
        crs="EPSG:4326",
    )


def _align_to_admin(per_unit: pd.Series, admin_gdf: gpd.GeoDataFrame) -> np.ndarray:
    """Project a ``unit_id -> value`` series back onto admin row order."""
    return per_unit.reindex(range(len(admin_gdf))).fillna(0.0).to_numpy(dtype="float64")


def _area_reallocate(cells: gpd.GeoDataFrame, admin_gdf: gpd.GeoDataFrame) -> np.ndarray:
    """Split each cell's value across overlapping units by intersection area."""
    units = admin_gdf.reset_index(drop=True).copy()
    units["unit_id"] = np.arange(len(units))
    cells_m = cells.to_crs(_EQUAL_AREA_EPSG)
    units_m = units[["unit_id", "geometry"]].to_crs(_EQUAL_AREA_EPSG)
    inter = gpd.overlay(cells_m, units_m, how="intersection")
    if inter.empty:
        return np.zeros(len(admin_gdf), dtype="float64")
    inter["piece_area"] = inter.geometry.area
    # Renormalize each cell over the land it actually touches so coastal cells
    # do not lose their offshore fraction.
    cell_land = inter.groupby("cell_id")["piece_area"].transform("sum")
    inter["alloc"] = inter["piece_area"] / cell_land * inter["cell_value"]
    per_unit = inter.groupby("unit_id")["alloc"].sum()
    return _align_to_admin(per_unit, units)


def _dasymetric_reallocate(
    cells: gpd.GeoDataFrame,
    admin_gdf: gpd.GeoDataFrame,
    pop_points: gpd.GeoDataFrame,
) -> np.ndarray:
    """Split each cell's value across units by the population in each overlap."""
    units = admin_gdf.reset_index(drop=True).copy()
    units["unit_id"] = np.arange(len(units))

    pts = pop_points[["pop", "geometry"]].copy()
    # pixel -> cell (within, nearest fallback for orphan islands)
    pts = gpd.sjoin(pts, cells[["cell_id", "geometry"]], how="left", predicate="within")
    pts = pts.drop(columns=[c for c in ("index_right",) if c in pts.columns])
    missing = pts["cell_id"].isna()
    if missing.any():
        near = gpd.sjoin_nearest(
            pts.loc[missing, ["pop", "geometry"]].to_crs(_EQUAL_AREA_EPSG),
            cells[["cell_id", "geometry"]].to_crs(_EQUAL_AREA_EPSG),
            how="left",
        )
        near = near[~near.index.duplicated(keep="first")]
        pts.loc[missing, "cell_id"] = near["cell_id"].to_numpy()
    pts = pts.dropna(subset=["cell_id"])
    pts["cell_id"] = pts["cell_id"].astype(int)

    # pixel -> unit (within only; offshore pixels are dropped so each cell's
    # value renormalizes over the land population it touches)
    pts = gpd.sjoin(pts, units[["unit_id", "geometry"]], how="left", predicate="within")
    pts = pts.drop(columns=[c for c in ("index_right",) if c in pts.columns])
    land = pts.dropna(subset=["unit_id"]).copy()
    land["unit_id"] = land["unit_id"].astype(int)

    cell_value = dict(zip(cells["cell_id"], cells["cell_value"], strict=True))
    pop_by_cell = land.groupby("cell_id")["pop"].sum()
    grouped = land.groupby(["cell_id", "unit_id"])["pop"].sum().reset_index()
    grouped["weight"] = grouped["pop"] / grouped["cell_id"].map(pop_by_cell)
    grouped["alloc"] = grouped["weight"] * grouped["cell_id"].map(cell_value)
    per_unit = grouped.groupby("unit_id")["alloc"].sum()

    # Cells that carry value but caught no land population (e.g. an unpopulated
    # industrial cell) keep their mass via an area split so the total is
    # conserved.
    assigned = set(pop_by_cell.index)
    orphan_ids = [c for c, v in cell_value.items() if v > 0 and c not in assigned]
    if orphan_ids:
        orphan_vals = _area_reallocate(cells[cells["cell_id"].isin(orphan_ids)], units)
        per_unit = per_unit.add(pd.Series(orphan_vals, index=range(len(units))), fill_value=0.0)
    return _align_to_admin(per_unit, units)


def reallocate_values_to_admin(
    lats: np.ndarray,
    lons: np.ndarray,
    values: np.ndarray,
    admin_gdf: gpd.GeoDataFrame,
    pop_points: gpd.GeoDataFrame | None = None,
) -> np.ndarray:
    """Reallocate grid-point ``values`` onto ``admin_gdf`` rows, mass-conserving.

    :param lats: Latitudes of the exposure grid points.
    :param lons: Longitudes of the exposure grid points.
    :param values: Per-point exposure values (same length as ``lats``/``lons``).
    :param admin_gdf: Admin polygons to aggregate onto; the result is aligned to
        its row order.
    :param pop_points: Optional population points (see
        :func:`load_population_points`). When provided the split is weighted by
        population (dasymetric); otherwise it falls back to overlap area.
    :return: A float array of length ``len(admin_gdf)`` giving each unit's value.
    """
    lats = np.asarray(lats, dtype="float64")
    lons = np.asarray(lons, dtype="float64")
    values = np.asarray(values, dtype="float64")
    cells = _build_cells(lats, lons, values)
    if pop_points is not None and len(pop_points) > 0:
        return _dasymetric_reallocate(cells, admin_gdf, pop_points)
    return _area_reallocate(cells, admin_gdf)
