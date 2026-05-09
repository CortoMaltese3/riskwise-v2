"""Catalog-availability and file-type detection helpers."""

from __future__ import annotations

from os import path
from pathlib import Path

from backend.engine.catalog import CatalogError, is_dataset_available
from backend.logging_config import get_logger
from backend.utils.country import get_iso3_country_code

logger = get_logger("backend.utils.data_check")


def check_data_type(country_name: str, data_type: str) -> bool:
    """Return ``True`` when the bundled catalog ships ``data_type`` for ``country_name``."""
    try:
        country_code = get_iso3_country_code(country_name) or country_name
        return is_dataset_available(country_code, data_type)
    except CatalogError as exception:
        logger.error(f"Catalog lookup failed. More info: {exception}")
        return False
    except (LookupError, AttributeError, TypeError, ValueError) as exception:
        logger.error(f"An error has occurred. More info: {exception}")
        return False


# Recognized hazard-data file extensions. ``.h5`` is treated as ``.hdf5`` and
# ``.tiff`` as ``.tif`` so callers can match the canonical type unambiguously.
_RECOGNIZED_TYPES: dict[str, str] = {
    ".mat": "mat",
    ".hdf5": "hdf5",
    ".h5": "hdf5",
    ".tif": "raster",
    ".tiff": "raster",
}


def check_file_type(file_path: Path) -> str | None:
    """Return the canonical type for ``file_path`` or ``None`` when unrecognized."""
    try:
        if not file_path.is_file():
            logger.error(f"File does not exist: {file_path}")
            return None
        _, file_extension = path.splitext(file_path)
        file_extension = file_extension.lower()
        if file_extension in _RECOGNIZED_TYPES:
            return _RECOGNIZED_TYPES[file_extension]
        logger.info(f"Unrecognized file type: {file_extension}")
        return None
    except (OSError, AttributeError, TypeError) as e:
        logger.error(f"An unexpected error occurred: {str(e)}")
        return None
