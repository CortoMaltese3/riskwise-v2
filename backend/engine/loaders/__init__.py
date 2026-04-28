"""Hazard / exposure / measure loaders for the engine adapter boundary.

Each loader reads one input format (HDF5, GeoTIFF, XLSX) and returns one
of the dataclasses from :mod:`backend.engine.types` — the same shapes
the adapter functions in :mod:`backend.engine.adapter` consume. This
keeps file I/O off the engine adapter and out of the handler layer.
"""

from backend.engine.loaders._errors import EntityLoadError, HazardLoadError
from backend.engine.loaders.gpkg import load_exposures_gpkg
from backend.engine.loaders.hdf5 import load_hazard_h5
from backend.engine.loaders.raster import load_hazard_raster
from backend.engine.loaders.xlsx import load_entity_xlsx

__all__ = [
    "EntityLoadError",
    "HazardLoadError",
    "load_entity_xlsx",
    "load_exposures_gpkg",
    "load_hazard_h5",
    "load_hazard_raster",
]
