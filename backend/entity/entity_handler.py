"""
Module for handling entity data and operations.

This module contains the `EntityHandler` class, which manages entity-related operations such as
creating entity objects, retrieving entity data from files, and generating future entity 
projections.

Classes:

- `EntityHandler`: 
    Class for handling entity data and operations.

Methods:

- `get_entity`: 
    Initialize and return an Entity object based on provided data.
- `get_entity_from_xlsx`: 
    Retrieve entity data from an Excel file and create an Entity object.
- `get_future_entity`: 
    Generate a future Entity object based on the provided entity and parameters.
"""

from copy import deepcopy
from pathlib import Path

import pandas as pd
from climada.entity import DiscRates, Entity, Exposures
from climada.entity.measures import MeasureSet
from climada.entity.impact_funcs import ImpactFuncSet
from climada.util.api_client import Client


from cache import file_cache_key, get_entity_cache
from constants import DATA_ENTITIES_DIR
from logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])


class EntityHandler:
    """
    Class for handling entity data and operations.

    This class provides methods for creating entity objects, retrieving entity data from files,
    and generating future entity projections.
    """

    def __init__(self):
        self.client = Client()

    def get_entity(
        self,
        exposure: Exposures,
        discount_rates: DiscRates,
        impact_function_set: ImpactFuncSet,
        measure_set: MeasureSet,
    ) -> Entity:
        """
        Initializes and returns an Entity object based on the provided exposure data,
        discount rates, impact function set, and adaptation measure set.

        :param exposure: The exposure data for the entity.
        :type exposure: Exposure
        :param discount_rates: A list of discount rates applicable to the entity.
        :type discount_rates: list
        :param impact_function_set: The set of impact functions associated with the entity.
        :type impact_function_set: ImpactFunctionSet
        :param measure_set: The set of adaptation measures applicable to the entity.
        :type measure_set: MeasureSet
        :return: An initialized Entity object.
        :rtype: Entity

        :raises ValueError: If any of the inputs are not valid or are missing necessary data.
        """
        try:
            if not exposure or not discount_rates or not impact_function_set or not measure_set:
                raise ValueError("All parameters must be provided and valid.")

            entity = Entity(exposure, discount_rates, impact_function_set, measure_set)
            return entity
        except Exception as e:
            logger.log("error", f"Failed to initialize Entity object: {e}")
            raise ValueError(f"Failed to initialize Entity object: {e}") from e

    def get_entity_from_xlsx(self, filepath: str) -> Entity:
        """
        Retrieves an Entity object from an Excel file.

        This method reads an Entity object from the specified Excel file. It then checks the
        validity of the entity and its exposure data before returning it. If any errors occur
        during the process, it logs the error and returns None.

        :param filepath: The file path of the Excel file containing the Entity data.
        :type filepath: str
        :return: An Entity object created from the Excel file.
        :rtype: Entity or None
        """
        try:
            entity_filepath = DATA_ENTITIES_DIR / filepath
            cache = get_entity_cache()
            cache_key = file_cache_key(entity_filepath)
            cached = cache.get(cache_key)
            if cached is not None:
                return cached
            entity = Entity.from_excel(entity_filepath)
            entity.check()
            exposure = entity.exposures
            exposure.gdf = exposure.gdf.loc[:, ~exposure.gdf.columns.str.contains("^Unnamed")]
            # Write a parquet sidecar next to the xlsx so repeat loads can
            # skip the openpyxl parse of the exposures sheet. The sidecar is
            # keyed by the xlsx mtime via write_exposures_parquet; a later
            # edit to the xlsx invalidates it automatically.
            self._write_exposures_parquet_sidecar(entity_filepath, exposure.gdf)
            cache.put(cache_key, entity)

            # Retrieve and check unique value units
            unique_value_units = entity.exposures.gdf["value_unit"].unique()
            if len(unique_value_units) == 1:
                value_unit = unique_value_units[0]
                # Set exposure's value_unit
                exposure.value_unit = value_unit
            else:
                raise ValueError(
                    "There are multiple different 'value_unit' values in the DataFrame"
                )
            exposure.check()

            return entity
        except Exception as exc:
            logger.log(
                "error",
                f"An error occurred while trying to create entity from xlsx. More info: {exc}",
            )
            return None

    def get_future_entity(self, entity: Entity, future_year: int, aag: float) -> Entity:
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
