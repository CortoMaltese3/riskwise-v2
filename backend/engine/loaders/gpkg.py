"""GeoPackage exposure loader — riskwise-side replacement for ``Exposures(gpd.read_file(path))``.

Reads a point-exposure GeoPackage and returns an
:class:`backend.engine.types.ExposureArrays`. The two paths (CLIMADA's
``Exposures`` wrapping a ``GeoDataFrame`` and the engine's array-shaped
``ExposureArrays``) run side by side for the duration of Phase 6 so the
parity tests can pin the new path against CLIMADA on the same fixtures.

Schema expected
---------------
* ``value``       — exposure value (required).
* ``geometry``    — point geometry in EPSG:4326 (required for lat/lon
  derivation when no explicit ``latitude``/``longitude`` columns are
  present).
* ``impf_<haz>`` (or generic ``impf_``)
                  — impact-function id (required).
* ``latitude`` / ``longitude``
                  — optional explicit columns; preferred over geometry
  when present (matches the XLSX loader's column-first layout).
* ``deductible`` / ``cover``
                  — optional insurance fields.
* ``value_unit``  — optional; defaults to ``"USD"`` to match the XLSX
  loader.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np

from backend.engine.loaders._errors import EntityLoadError
from backend.engine.types import ExposureArrays

__all__ = ["load_exposures_gpkg"]


def load_exposures_gpkg(path: Path) -> ExposureArrays:
    """Load a point-exposure GeoPackage into :class:`ExposureArrays`.

    Parameters
    ----------
    path:
        Path to the ``.gpkg`` file.

    Returns
    -------
    ExposureArrays
        Frozen aggregator with values, lat/lon, impact-function ids,
        and optional insurance / unit metadata.

    Raises
    ------
    EntityLoadError
        File missing, required column missing, invalid numeric value,
        or empty layer. The message names the offending column.
    """
    path = Path(path)
    if not path.is_file():
        raise EntityLoadError(f"Exposure file not found: {path}")

    try:
        gdf = gpd.read_file(path)
    except (OSError, ValueError, RuntimeError) as exc:
        # geopandas/fiona surface I/O failures as OSError (Windows file lock,
        # missing driver), schema mismatches as ValueError, and pyogrio's own
        # errors derive from RuntimeError.
        raise EntityLoadError(f"Cannot open GeoPackage {path}: {exc}") from exc

    if "value" not in gdf.columns:
        raise EntityLoadError(f"Missing required column 'value' in {path.name}")
    if gdf.empty:
        raise EntityLoadError(f"No exposure rows in {path.name}")

    impf_col = _find_impf_col(gdf.columns)
    if impf_col is None:
        raise EntityLoadError(
            f"Missing required column 'impf_' (or 'impf_<haz_type>') in {path.name}"
        )

    if "latitude" in gdf.columns and "longitude" in gdf.columns:
        lat = np.asarray(gdf["latitude"].to_numpy(), dtype=np.float64)
        lon = np.asarray(gdf["longitude"].to_numpy(), dtype=np.float64)
    else:
        try:
            lat = np.asarray(gdf.geometry.y.to_numpy(), dtype=np.float64)
            lon = np.asarray(gdf.geometry.x.to_numpy(), dtype=np.float64)
        except (AttributeError, ValueError, TypeError) as exc:
            raise EntityLoadError(
                f"Cannot derive lat/lon from geometry in {path.name}: {exc}"
            ) from exc

    try:
        values = np.asarray(gdf["value"].to_numpy(), dtype=np.float64)
        impf_id = np.asarray(gdf[impf_col].to_numpy(), dtype=np.int64)
    except (TypeError, ValueError) as exc:
        raise EntityLoadError(f"Invalid numeric value in {path.name}: {exc}") from exc

    n = len(values)
    centroid_idx = np.arange(n, dtype=np.int64)

    deductible = _opt_array(gdf, "deductible")
    cover = _opt_array(gdf, "cover")

    value_unit = "USD"
    if "value_unit" in gdf.columns:
        units = gdf["value_unit"].dropna().unique()
        if len(units):
            value_unit = str(units[0])

    return ExposureArrays(
        values=values,
        centroid_idx=centroid_idx,
        impf_id=impf_id,
        lat=lat,
        lon=lon,
        deductible=deductible,
        cover=cover,
        value_unit=value_unit,
    )


def _find_impf_col(columns) -> str | None:
    """Return the first column whose name starts with ``impf_`` (case-insensitive)."""
    for col in columns:
        if isinstance(col, str) and col.lower().startswith("impf_"):
            return col
    return None


def _opt_array(gdf: gpd.GeoDataFrame, col: str) -> np.ndarray | None:
    if col not in gdf.columns:
        return None
    return np.asarray(gdf[col].fillna(0.0).to_numpy(), dtype=np.float64)
