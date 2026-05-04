"""
Module for handling entity data and operations.

This module contains the `EntityHandler` class, which manages entity-related operations such as
creating entity objects, retrieving entity data from files, and generating future entity
projections.

Classes:

- `EntityHandler`:
    Class for handling entity data and operations.

Methods:

- `get_entity_from_xlsx`:
    Retrieve entity data from an Excel file and create an EntityBundle.
- `get_future_entity`:
    Generate a future EntityBundle based on the provided entity and parameters.
"""

from copy import deepcopy
from pathlib import Path
from typing import Any

import pandas as pd

from backend.cache import file_cache_key, get_entity_cache
from backend.constants import DATA_ENTITIES_DIR
from backend.logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])


class EntityHandler:
    """
    Class for handling entity data and operations.

    This class provides methods for retrieving entity data from files and generating future
    entity projections. All paths route through the climate-lama-engine adapter.
    """

    def __init__(self):
        pass

    def get_entity_from_xlsx(self, filepath: str) -> Any:
        """
        Retrieve an :class:`backend.engine.types.EntityBundle` from an Excel file.

        Loads the workbook through :func:`backend.engine.loaders.xlsx.load_entity_xlsx`
        and caches the result keyed by the source file's content hash.

        :param filepath: The file path of the Excel file containing the entity data.
        :return: An ``EntityBundle`` or ``None`` when the load fails.
        """
        try:
            entity_filepath = DATA_ENTITIES_DIR / filepath
            return self._get_entity_bundle_via_engine(entity_filepath)
        except Exception as exc:
            logger.log(
                "error",
                f"An error occurred while trying to create entity from xlsx. More info: {exc}",
            )
            return None

    def _get_entity_bundle_via_engine(self, entity_filepath: Path) -> Any:
        """Load an :class:`EntityBundle` via the engine xlsx loader, with caching."""
        from backend.engine.loaders.xlsx import load_entity_xlsx

        cache = get_entity_cache()
        cache_key = f"{file_cache_key(entity_filepath)}|engine"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            bundle = load_entity_xlsx(entity_filepath)
        except Exception as exc:
            logger.log(
                "error",
                f"An error occurred while trying to create EntityBundle from xlsx. "
                f"More info: {exc}",
            )
            return None
        cache.put(cache_key, bundle)
        return bundle

    def get_future_entity(self, entity: Any, future_year: int, aag: float) -> Any:
        """
        Generate a future entity based on the provided entity and year.

        :param entity: The entity object to be used as a base for the future entity.
        :type entity: Entity
        :param year: The year for which the future entity should be generated.
        :type year: int
        :param aag: The annual average growth rate for the future entity.
        :type aag: float
        :return: A future entity object based on the provided entity and year.
        :rtype: Entity
        """
        try:
            present_year = entity.exposures.ref_year
            entity_future = deepcopy(entity)
            entity_future.exposures.ref_year = future_year

            # Approach #1
            entity_future.exposures.gdf["value"] = entity_future.exposures.gdf["value"].values * (
                1 + aag
            ) ** (future_year - present_year)

            # Approach #2
            # number_of_years = future_year - present_year  # + 1
            # growth = aag**number_of_years
            # entity_future.exposures.gdf["value"] = entity_future.exposures.gdf["value"] * growth

            entity_future.check()

            return entity_future
        except Exception as e:
            logger.log("error", f"Failed to generate future entity: {e}")
            return None

    @staticmethod
    def parquet_sidecar_path(xlsx_path: Path | str) -> Path:
        """Return the sibling ``.parquet`` path for an entity ``.xlsx``."""
        return Path(xlsx_path).with_suffix(".parquet")

    def _write_exposures_parquet_sidecar(
        self, xlsx_path: Path | str, gdf: "pd.DataFrame"
    ) -> None:
        sidecar = self.parquet_sidecar_path(xlsx_path)
        try:
            # GeoDataFrame round-trips through parquet when pyarrow is
            # available; fall back to the plain DataFrame representation
            # if the geometry column trips serialisation.
            frame: pd.DataFrame = gdf
            if hasattr(gdf, "to_parquet"):
                frame.to_parquet(sidecar, index=False)
            else:  # pragma: no cover - defensive
                pd.DataFrame(gdf).to_parquet(sidecar, index=False)
        except Exception as exc:  # pragma: no cover - sidecar is best-effort
            logger.log(
                "warning",
                f"Failed to write parquet sidecar for {xlsx_path}: {exc}",
            )

    def load_exposures_dataframe(self, xlsx_path: Path | str) -> "pd.DataFrame":
        """Load the exposures DataFrame, preferring the parquet sidecar.

        Returns the DataFrame straight from the sibling ``.parquet`` when
        it exists and is at least as fresh as the ``.xlsx``. Otherwise the
        xlsx is parsed, a sidecar is written for next time, and the parsed
        frame is returned.
        """
        xlsx = Path(xlsx_path)
        sidecar = self.parquet_sidecar_path(xlsx)
        if sidecar.is_file() and xlsx.is_file():
            if sidecar.stat().st_mtime_ns >= xlsx.stat().st_mtime_ns:
                return pd.read_parquet(sidecar)
        df = pd.read_excel(xlsx)
        df = df.loc[:, ~df.columns.str.contains("^Unnamed")]
        try:
            df.to_parquet(sidecar, index=False)
        except Exception as exc:  # pragma: no cover
            logger.log(
                "warning",
                f"Failed to write parquet sidecar for {xlsx}: {exc}",
            )
        return df

    def get_entity_filename(self, country_code: str, hazard_code: str, exposure_type: str) -> str:
        """
        Get the entity filename based on the request parameters.
        This helper method sets the entity filename in a specific format to be searched
        in the data/entities directory

        :return: The entity filename.
        :rtype: str
        """
        entity_filename = f"entity_TODAY_{country_code}_{hazard_code}_{exposure_type}.xlsx"
        return entity_filename
