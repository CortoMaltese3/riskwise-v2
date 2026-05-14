"""Parquet read/write helpers for the scenario report pipeline."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from backend.logging_config import get_logger

logger = get_logger("backend.utils.io")


def read_parquet_file(file_path: str | Path) -> pd.DataFrame | None:
    """Read a ``.parquet`` file. Returns ``None`` on failure."""
    try:
        path_obj = Path(file_path)
        if not path_obj.is_file():
            raise FileNotFoundError(f"File does not exist: {path_obj}")
        if path_obj.suffix != ".parquet":
            raise ValueError(f"Incorrect file extension: {path_obj.suffix}. Expected .parquet")
        return pd.read_parquet(path_obj)
    except FileNotFoundError as fnf_error:
        logger.error(str(fnf_error))
    except ValueError as ve:
        logger.error(str(ve))
    except OSError as e:
        logger.error(f"An unexpected error occurred while reading the file: {str(e)}")
    return None


def save_parquet_file(df: pd.DataFrame, file_path: str | Path) -> str | Path | None:
    """Write ``df`` as Snappy-compressed parquet. Returns the path on success."""
    try:
        if not str(file_path).endswith(".parquet"):
            raise ValueError("The file name must end with .parquet")
        df.to_parquet(file_path, index=False, compression="snappy")
        return file_path
    except ValueError as ve:
        logger.error(str(ve))
    except OSError as e:
        logger.error(f"An unexpected error occurred while saving the file: {str(e)}")
    return None
