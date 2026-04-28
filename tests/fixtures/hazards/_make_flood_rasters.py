"""Generate the small RP-banded flood TIF fixtures used by the raster loader tests.

Run from the repo root::

    .venv/Scripts/python tests/fixtures/hazards/_make_flood_rasters.py

The fixtures are deterministic and tiny (5x5 grid, 4 bands, ~1 KB each).
The script is idempotent: it overwrites the three fixtures every run, so
re-running after a numpy/rasterio version bump will reproduce identical
files (deterministic seed).

Three fixtures:

* ``egy_flood_present_rp.tif`` — WGS84, 4 RP bands.
* ``egy_flood_future_rp.tif``  — WGS84, 4 RP bands; same grid, ~1.2x intensities.
* ``egy_flood_present_3857.tif`` — EPSG:3857 reprojection of the present grid;
  used by the CRS edge-case test.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

HERE = Path(__file__).parent
RPS = [10, 50, 100, 250]


def _present_intensity() -> np.ndarray:
    """Return a (4, 5, 5) intensity stack — one slab per RP, increasing with RP."""
    rng = np.random.default_rng(seed=42)
    base = rng.uniform(0.0, 0.5, size=(5, 5))
    return np.stack([base * (1 + 0.6 * i) for i in range(len(RPS))]).astype(np.float32)


def _write_wgs84_tif(path: Path, data: np.ndarray) -> None:
    transform = from_origin(west=29.5, north=31.5, xsize=0.5, ysize=0.5)
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": data.shape[0],
        "height": data.shape[1],
        "width": data.shape[2],
        "transform": transform,
        "crs": "EPSG:4326",
    }
    with rasterio.open(path, "w", **profile) as ds:
        for i in range(data.shape[0]):
            ds.write(data[i], i + 1)


def _write_3857_tif(path: Path, present_data: np.ndarray) -> None:
    """Same intensities, projected to EPSG:3857 with a synthetic transform.

    The transform is computed by reprojecting the WGS84 raster's origin
    and pixel size to Web Mercator. This keeps the WGS84-equivalent
    pixel centers within ``1e-6`` deg of the reference grid (the
    tolerance the CRS edge-case test asserts).
    """
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    x0, y0 = transformer.transform(29.5, 31.5)
    x1, y1 = transformer.transform(30.0, 31.0)
    transform = from_origin(west=x0, north=y0, xsize=x1 - x0, ysize=y0 - y1)
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": present_data.shape[0],
        "height": present_data.shape[1],
        "width": present_data.shape[2],
        "transform": transform,
        "crs": "EPSG:3857",
    }
    with rasterio.open(path, "w", **profile) as ds:
        for i in range(present_data.shape[0]):
            ds.write(present_data[i], i + 1)


def main() -> None:
    present = _present_intensity()
    future = (present * 1.2).astype(np.float32)
    _write_wgs84_tif(HERE / "egy_flood_present_rp.tif", present)
    _write_wgs84_tif(HERE / "egy_flood_future_rp.tif", future)
    _write_3857_tif(HERE / "egy_flood_present_3857.tif", present)
    print("wrote egy_flood_present_rp.tif, egy_flood_future_rp.tif, egy_flood_present_3857.tif")


if __name__ == "__main__":
    main()
