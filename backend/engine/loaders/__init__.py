"""Hazard / exposure / measure loaders for the engine adapter boundary.

Each loader reads one input format (HDF5, GeoTIFF, XLSX) and returns one
of the dataclasses from :mod:`backend.engine.types` — the same shapes
the adapter functions in :mod:`backend.engine.adapter` consume. This
keeps file I/O off the engine adapter and out of the handler layer.
"""

from backend.engine.loaders._errors import HazardLoadError
from backend.engine.loaders.hdf5 import load_hazard_h5

__all__ = ["HazardLoadError", "load_hazard_h5"]
