"""Scenario metadata file helpers.

A scenario run drops a small ``_metadata.txt`` next to its results: one
line of tab-separated keys, one line of tab-separated values. The reader
re-inflates the typed values the rest of the pipeline expects (numeric
year fields, the ``is_era`` boolean, and the floating-point
``annual_growth``).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.constants import DATA_TEMP_DIR, REPORTS_DIR
from backend.logging_config import get_logger

logger = get_logger("backend.utils.metadata")


def create_results_metadata_file(metadata: dict[str, Any]) -> None:
    """Write ``metadata`` as a two-line TSV under ``DATA_TEMP_DIR``."""
    filepath = DATA_TEMP_DIR / "_metadata.txt"
    try:
        with open(filepath, "w") as file:
            file.write("\t".join(metadata.keys()) + "\n")
            file.write("\t".join(map(str, metadata.values())) + "\n")
    except OSError as e:
        logger.error(f"An I/O error occurred: {e.strerror}")
    except (TypeError, ValueError) as e:
        logger.error(f"An unexpected error occurred: {str(e)}")


def read_results_metadata_file(
    metadata_filepath: Path | None = None,
) -> dict[str, Any]:
    """Read a TSV metadata file and return a typed dict.

    :param metadata_filepath: Optional explicit path; defaults to
        ``DATA_TEMP_DIR / "_metadata.txt"``.
    :return: ``{}`` on any I/O / parse failure.
    """
    metadata: dict[str, Any] = {}
    try:
        filepath = metadata_filepath if metadata_filepath else DATA_TEMP_DIR / "_metadata.txt"
        with open(filepath) as file:
            keys = file.readline().strip().split("\t")
            values = file.readline().strip().split("\t")
            metadata = dict(zip(keys, values, strict=False))
            metadata["annual_growth"] = float(metadata["annual_growth"])
            metadata["is_era"] = metadata["is_era"].lower() == "true"
            metadata["ref_year"] = int(metadata["ref_year"])
            metadata["future_year"] = int(metadata["future_year"])
    except FileNotFoundError as e:
        logger.error(f"Metadata file not found: {str(e)}")
    except OSError as e:
        logger.error(f"An I/O error occurred: {e.strerror}")
    except (KeyError, ValueError, TypeError) as e:
        logger.error(f"An unexpected error occurred: {str(e)}")
    return metadata


def get_scenario_metadata(scenario_id: str) -> dict[str, Any]:
    """Resolve and read the metadata file for a stored scenario run."""
    try:
        target_dir = REPORTS_DIR / scenario_id
        metadata_file_path = target_dir / "_metadata.txt"
        if not metadata_file_path.exists():
            raise FileNotFoundError(f"Metadata file not found in {target_dir}")
        return read_results_metadata_file(metadata_file_path)
    except StopIteration as exc:
        raise ValueError(f"No directory found for scenario ID: {scenario_id}") from exc
    except (OSError, KeyError, ValueError, TypeError) as e:
        logger.error(f"An unexpected error occurred while retrieving metadata: {str(e)}")
        return {}
