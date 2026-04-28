"""HDF5 hazard loader — riskwise-side replacement for ``Hazard.from_hdf5``.

Reads the on-disk layout produced by
:meth:`climada.hazard.Hazard.write_hdf5` and returns a
:class:`backend.engine.types.HazardArrays`. The two paths run side by
side for the duration of Phase 6 so the parity tests can pin the new
path against CLIMADA on the same fixtures.

CLIMADA's HDF5 layout (per ``climada/hazard/base.py::write_hdf5``):

* ``intensity`` / ``fraction`` are CSR groups holding ``data``,
  ``indices``, ``indptr`` 1D datasets plus a ``shape`` group attribute.
* ``frequency`` is a 1D float dataset.
* ``haz_type``, ``units``, ``frequency_unit`` are length-1 string
  datasets.
* ``event_name`` is a variable-length string array.
* ``centroids`` is a group. Vector-mode files write ``centroids/lat``
  and ``centroids/lon`` directly. Raster-mode files (e.g. the Thailand
  drought baseline) write empty lat/lon and stash an Affine transform
  under ``centroids/meta``; CLIMADA derives lat/lon lazily via
  :meth:`Centroids.set_meta_to_lat_lon`. This loader does the same
  derivation eagerly so the returned ``HazardArrays`` is always
  array-shaped.

``frequency_type`` has no canonical home in CLIMADA's HDF5 layout —
CLIMADA only stores ``frequency_unit``. The loader honours an optional
top-level ``frequency_type`` attribute or dataset if a producer writes
one, otherwise falls back to the :class:`HazardArrays` default.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import h5py
import numpy as np
from scipy import sparse

from backend.engine.loaders._errors import HazardLoadError
from backend.engine.types import HazardArrays

__all__ = ["load_hazard_h5"]


def load_hazard_h5(path: Path) -> HazardArrays:
    """Load a CLIMADA-format hazard HDF5 file into :class:`HazardArrays`.

    Parameters
    ----------
    path:
        Path to the ``.h5`` file written by :meth:`climada.hazard.Hazard.write_hdf5`.

    Returns
    -------
    HazardArrays
        Frozen dataclass with intensity (CSR), frequency, centroid lat/lon,
        and string metadata. Centroids derived from raster meta when the
        file stores no explicit lat/lon arrays.

    Raises
    ------
    HazardLoadError
        File missing, required dataset missing, or shape mismatch among
        intensity / frequency / centroid arrays.
    """
    path = Path(path)
    if not path.is_file():
        raise HazardLoadError(f"Hazard file not found: {path}")

    with h5py.File(path, "r") as hf:
        intensity = _read_csr(hf, "intensity")
        frequency = _require(hf, "frequency")[:]
        centroid_lat, centroid_lon = _read_centroids(hf)

        haz_type = _read_str(hf, "haz_type", default="RF")
        intensity_unit = _read_str(hf, "units", default="")
        event_names = _read_event_names(hf)
        frequency_type = _read_frequency_type(hf)

    _check_shapes(intensity, frequency, centroid_lat, centroid_lon)

    return HazardArrays(
        intensity=intensity,
        frequency=frequency,
        centroid_lat=centroid_lat,
        centroid_lon=centroid_lon,
        haz_type=haz_type,
        intensity_unit=intensity_unit,
        frequency_type=frequency_type,
        event_names=event_names,
    )


def _require(parent: h5py.Group, name: str) -> Any:
    """Return ``parent[name]`` or raise :class:`HazardLoadError` naming the path."""
    if name not in parent:
        prefix = "" if parent.name == "/" else parent.name.lstrip("/") + "/"
        raise HazardLoadError(f"Required dataset not found in H5: {prefix}{name!r}")
    return parent[name]


def _decode(value: Any) -> str:
    """Decode an h5py scalar (bytes or str) to a Python ``str``."""
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def _read_csr(hf: h5py.File, name: str) -> sparse.csr_matrix:
    group = _require(hf, name)
    if not isinstance(group, h5py.Group):
        # CLIMADA's todense=True branch stores intensity as a dense Dataset.
        return sparse.csr_matrix(group[:])
    data = _require(group, "data")[:]
    indices = _require(group, "indices")[:]
    indptr = _require(group, "indptr")[:]
    if "shape" not in group.attrs:
        raise HazardLoadError(f"Required attribute not found in H5: {name}.attrs['shape']")
    shape = tuple(int(x) for x in group.attrs["shape"])
    return sparse.csr_matrix((data, indices, indptr), shape=shape)


def _read_centroids(hf: h5py.File) -> tuple[np.ndarray, np.ndarray]:
    group = _require(hf, "centroids")
    lat_ds = group.get("lat")
    lon_ds = group.get("lon")
    if lat_ds is not None and lat_ds.size and lon_ds is not None and lon_ds.size:
        return lat_ds[:], lon_ds[:]

    meta = group.get("meta")
    if meta is None:
        raise HazardLoadError(
            "Required dataset not found in H5: 'centroids/lat' (and no 'centroids/meta' fallback)"
        )
    transform = _require(meta, "transform")[:].astype(np.float64, copy=False)
    width = int(_require(meta, "width")[0])
    height = int(_require(meta, "height")[0])
    return _meshgrid_from_transform(transform, width, height)


def _meshgrid_from_transform(
    transform: np.ndarray, width: int, height: int
) -> tuple[np.ndarray, np.ndarray]:
    """Mirror :func:`climada.util.coordinates.raster_to_meshgrid`.

    Reproducing the formula here (rather than calling CLIMADA) keeps the
    loader importable on dev boxes that haven't installed CLIMADA — same
    rationale as the lazy import in :mod:`backend.engine.adapter`.
    """
    xres, _b, xmin, _d, yres, ymin = transform[:6]
    xmax = xmin + width * xres
    ymax = ymin + height * yres
    xgrid, ygrid = np.meshgrid(
        np.arange(xmin + xres / 2, xmax, xres),
        np.arange(ymin + yres / 2, ymax, yres),
    )
    return ygrid.flatten(), xgrid.flatten()


def _read_str(hf: h5py.File, name: str, *, default: str) -> str:
    if name not in hf:
        return default
    raw = hf[name][:]
    if len(raw) == 0:
        return default
    return _decode(raw[0])


def _read_event_names(hf: h5py.File) -> tuple[str, ...] | None:
    if "event_name" not in hf:
        return None
    return tuple(_decode(v) for v in hf["event_name"][:])


def _read_frequency_type(hf: h5py.File) -> str:
    default = HazardArrays.__dataclass_fields__["frequency_type"].default
    if "frequency_type" in hf.attrs:
        return _decode(hf.attrs["frequency_type"])
    return _read_str(hf, "frequency_type", default=default)


def _check_shapes(
    intensity: sparse.csr_matrix,
    frequency: np.ndarray,
    centroid_lat: np.ndarray,
    centroid_lon: np.ndarray,
) -> None:
    n_events, n_centroids = intensity.shape
    if frequency.shape != (n_events,):
        raise HazardLoadError(
            f"Shape mismatch: intensity {intensity.shape} vs frequency {frequency.shape}"
        )
    if centroid_lat.shape != (n_centroids,) or centroid_lon.shape != (n_centroids,):
        raise HazardLoadError(
            f"Shape mismatch: intensity {intensity.shape} vs centroid lat "
            f"{centroid_lat.shape} / lon {centroid_lon.shape}"
        )
