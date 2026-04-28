"""GeoTIFF (raster) hazard loader — riskwise-side replacement for ``Hazard.from_raster``.

Reads multi-band GeoTIFFs where each band is either one event (flat-event
mode) or one return-period intensity map (RP-band mode) and returns a
:class:`backend.engine.types.HazardArrays`. The two paths run side by
side for the duration of Phase 6 so the parity tests can pin the new
path against CLIMADA on the same fixtures.

CRS handling: WGS84 (``EPSG:4326``) is assumed. If the raster declares a
different CRS, pixel-center coordinates are reprojected to WGS84 via
:class:`pyproj.Transformer`. Intensity values are not resampled — only
the centroid lon/lat arrays change. Callers that need a fully
reprojected raster (resampled values) should preprocess the file
upstream; this loader's job is to surface the already-pixelated
intensities at WGS84 lat/lon.

RP-band mode delegates the RP→marginal-frequency conversion to
:func:`backend.engine.adapter.hazard_from_rp_maps` (which calls into
:meth:`climate_lama_engine.Hazard.from_rp_maps`). The resulting
``Hazard`` is unwrapped: only its ``frequency``, ``intensity``, and
``event_name`` are read; centroids, ``haz_type`` and ``intensity_unit``
come straight from the raster + caller arguments. ``frequency_type`` is
``"marginal"`` in RP-band mode and ``"occurrence"`` otherwise.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.errors import RasterioIOError
from scipy import sparse

from backend.engine.adapter import hazard_from_rp_maps
from backend.engine.loaders._errors import HazardLoadError
from backend.engine.types import HazardArrays

__all__ = ["load_hazard_raster"]

_WGS84_EPSG = 4326


def load_hazard_raster(
    path: Path,
    *,
    return_periods: list[int] | None = None,
    haz_type: str = "FL",
    intensity_unit: str = "m",
) -> HazardArrays:
    """Load a multi-band GeoTIFF into :class:`HazardArrays`.

    Parameters
    ----------
    path:
        Path to the ``.tif``/``.tiff`` file.
    return_periods:
        If provided, each raster band maps to one return period in the
        same order. Frequencies are then computed via the engine's
        ``Hazard.from_rp_maps`` math (marginal exceedance differences)
        and ``frequency_type`` is set to ``"marginal"``. If ``None``,
        each band is treated as one event with frequency taken from the
        band's ``frequency`` tag if present, or equal weights otherwise.
    haz_type, intensity_unit:
        Forwarded to :class:`HazardArrays`. Defaults match the flood
        raster catalogue (``FL`` / metres of inundation depth).

    Raises
    ------
    HazardLoadError
        File missing, raster unreadable, zero bands, or
        ``len(return_periods) != ds.count``.
    """
    path = Path(path)
    if not path.is_file():
        raise HazardLoadError(f"Hazard file not found: {path}")

    try:
        with rasterio.open(path) as ds:
            n_bands = ds.count
            if n_bands == 0:
                raise HazardLoadError(f"Hazard raster has no bands: {path}")
            if return_periods is not None and len(return_periods) != n_bands:
                raise HazardLoadError(
                    f"Bad band count: raster has {n_bands} bands but "
                    f"return_periods has {len(return_periods)} entries"
                )
            data = ds.read()
            transform = ds.transform
            width = ds.width
            height = ds.height
            crs = ds.crs
            band_tags = [ds.tags(i + 1) for i in range(n_bands)]
    except RasterioIOError as exc:
        raise HazardLoadError(f"Failed to read raster: {path} ({exc})") from exc

    intensity = sparse.csr_matrix(data.reshape(n_bands, -1).astype(np.float64, copy=False))
    centroid_lat, centroid_lon = _pixel_centers_wgs84(transform, width, height, crs)

    if return_periods is not None:
        haz = hazard_from_rp_maps(
            haz_type=haz_type,
            intensity_unit=intensity_unit,
            return_periods=return_periods,
            intensity=intensity,
            centroid_lat=centroid_lat,
            centroid_lon=centroid_lon,
        )
        event_names = tuple(haz.event_name) if haz.event_name else None
        return HazardArrays(
            intensity=haz.intensity,
            frequency=np.asarray(haz.frequency, dtype=np.float64),
            centroid_lat=centroid_lat,
            centroid_lon=centroid_lon,
            haz_type=haz_type,
            intensity_unit=intensity_unit,
            frequency_type="marginal",
            event_names=event_names,
        )

    return HazardArrays(
        intensity=intensity,
        frequency=_frequencies_from_band_tags(band_tags, n_bands),
        centroid_lat=centroid_lat,
        centroid_lon=centroid_lon,
        haz_type=haz_type,
        intensity_unit=intensity_unit,
        frequency_type="occurrence",
        event_names=None,
    )


def _pixel_centers_wgs84(
    transform: Any, width: int, height: int, crs: Any
) -> tuple[np.ndarray, np.ndarray]:
    """Return (lat, lon) arrays — one entry per pixel, row-major."""
    rows, cols = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")
    xs, ys = rasterio.transform.xy(transform, rows.flatten(), cols.flatten())
    xs = np.asarray(xs, dtype=np.float64)
    ys = np.asarray(ys, dtype=np.float64)

    if crs is None or crs.to_epsg() == _WGS84_EPSG:
        return ys, xs

    transformer = Transformer.from_crs(crs, f"EPSG:{_WGS84_EPSG}", always_xy=True)
    lon, lat = transformer.transform(xs, ys)
    return np.asarray(lat, dtype=np.float64), np.asarray(lon, dtype=np.float64)


def _frequencies_from_band_tags(band_tags: list[dict[str, str]], n_bands: int) -> np.ndarray:
    """Honour a per-band ``frequency`` tag if every band has one; else equal weights."""
    freqs: list[float] = []
    for tags in band_tags:
        if "frequency" not in tags:
            return np.full(n_bands, 1.0 / n_bands, dtype=np.float64)
        freqs.append(float(tags["frequency"]))
    return np.asarray(freqs, dtype=np.float64)
