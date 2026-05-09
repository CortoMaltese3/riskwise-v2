"""Filesystem bootstrap and temp-directory housekeeping."""

from __future__ import annotations

from os import makedirs, path

from backend.constants import (
    DATA_DIR,
    DATA_ENTITIES_DIR,
    DATA_EXPOSURES_DIR,
    DATA_HAZARDS_DIR,
    DATA_TEMP_DIR,
    LOG_DIR,
    REPORTS_DIR,
)
from backend.logging_config import get_logger

logger = get_logger("backend.utils.fs")


def initalize_data_directories() -> None:
    """Create the data/log/temp/reports tree on first run; no-op when present.

    The misspelled name is preserved deliberately — every caller in the
    backend uses ``initalize`` (not ``initialize``); renaming would
    silently no-op call sites the IDE missed.
    """
    for directory in (
        DATA_DIR,
        DATA_ENTITIES_DIR,
        DATA_EXPOSURES_DIR,
        DATA_HAZARDS_DIR,
        LOG_DIR,
        DATA_TEMP_DIR,
        REPORTS_DIR,
    ):
        if not path.exists(directory):
            makedirs(directory)


def clear_temp_dir() -> None:
    """Delete every entry directly under ``DATA_TEMP_DIR``."""
    try:
        for file in DATA_TEMP_DIR.glob("*"):
            file.unlink(missing_ok=True)
    except OSError as exc:
        logger.error(f"Error while trying to clear temp directory. More info: {exc}")
