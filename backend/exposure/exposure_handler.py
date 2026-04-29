"""
Module for handling exposure data and operations.

This module contains the `ExposureHandler` class, which manages exposure-related operations such as
calculating exposure growth, retrieving administrative data, and generating exposure GeoJSON files.

Classes:

- `ExposureHandler`:
    Class for handling exposure data and operations.

Methods:

- `get_exposure`:
    Load an exposure dataset from an XLSX or GeoPackage file.
- `get_growth_exposure`:
    Calculate exposure growth based on annual growth rate and future year.
- `generate_exposure_geojson`:
    Generate GeoJSON files for exposure data.
"""

import json
import os
from copy import deepcopy
from pathlib import Path

import geopandas as gpd
import pandas as pd
from base_handler import BaseHandler
from climada.entity import Entity, Exposures
from constants import DATA_TEMP_DIR
from logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])


def _is_engine_backend() -> bool:
    return os.environ.get("RISKWISE_ENGINE_BACKEND", "engine") == "engine"


def _infer_source(filepath) -> str:
    suffix = Path(filepath).suffix.lower()
    if suffix == ".xlsx":
        return "xlsx"
    if suffix == ".gpkg":
        return "gpkg"
    raise ValueError(
        f"Cannot infer exposure source from extension {suffix!r}; "
        f"pass source='xlsx' or 'gpkg' explicitly"
    )


class ExposureHandler:
    """
    Class for handling exposure data and operations.

    This class provides methods for fetching exposure data from an API, calculating exposure growth,
    retrieving administrative data, and generating exposure GeoJSON files.
    """

    def __init__(self):
        self.base_handler = BaseHandler()

    def get_exposure(self, filepath: Path, source: str | None = None):
        """Load an exposure dataset from an XLSX or GeoPackage file.

        Routes to the engine backend by default; setting
        ``RISKWISE_ENGINE_BACKEND=climada`` selects the legacy CLIMADA path.
        The engine branch routes through
        :func:`backend.engine.loaders.xlsx.load_entity_xlsx` (for ``.xlsx``
        entity files) or :func:`backend.engine.loaders.gpkg.load_exposures_gpkg`
        (for ``.gpkg`` exposure files), then ``backend.engine.adapter.build_exposures``.

        :param filepath: Path to an entity XLSX or exposure GeoPackage file.
        :param source: Optional explicit source (``"xlsx"`` or ``"gpkg"``).
            When omitted, derived from the file extension.
        :return: A ``climate_lama_engine.Exposures`` (default) or a CLIMADA
            ``Exposures`` when ``RISKWISE_ENGINE_BACKEND=climada``.
        """
        source = source or _infer_source(filepath)
        if source not in ("xlsx", "gpkg"):
            raise ValueError(
                f"Unsupported exposure source {source!r}; expected 'xlsx' or 'gpkg'"
            )

        if _is_engine_backend():
            return self._get_exposure_via_engine(filepath, source)

        if source == "xlsx":
            entity = Entity.from_excel(filepath)
            exposure = entity.exposures
            exposure.gdf = exposure.gdf.loc[:, ~exposure.gdf.columns.str.contains("^Unnamed")]
            return exposure
        # source == "gpkg"
        return Exposures(gpd.read_file(filepath))

    def _get_exposure_via_engine(self, filepath: Path, source: str):
        """Engine-backend equivalent of :meth:`get_exposure`.

        Routes through the engine loaders and ``build_exposures`` so the
        produced object is a ``climate_lama_engine.Exposures`` instead of a
        CLIMADA ``Exposures``.
        """
        from backend.engine.adapter import build_exposures
        from backend.engine.loaders.gpkg import load_exposures_gpkg
        from backend.engine.loaders.xlsx import load_entity_xlsx

        if source == "xlsx":
            arrays = load_entity_xlsx(Path(filepath)).exposures
        else:
            arrays = load_exposures_gpkg(Path(filepath))
        return build_exposures(arrays)

    def get_growth_exposure(
        self, exposure, annual_growth: float, future_year: int, ref_year: int | None = None
    ):
        """Apply an annual-growth multiplier to an exposure's value array.

        Multiplier: ``(1 + annual_growth) ** (future_year - ref_year)``. Works
        identically on both backends — the CLIMADA branch returns a deep-copied
        ``Exposures`` with multiplied ``gdf['value']``; the engine branch
        returns a new ``cc.Exposures`` with multiplied ``value`` array.

        :param exposure: A CLIMADA ``Exposures`` or a ``climate_lama_engine.Exposures``.
        :param annual_growth: Annual growth rate (e.g. ``0.02`` for 2 %/yr).
        :param future_year: Target year for the multiplied exposure.
        :param ref_year: Reference year. Defaults to ``exposure.ref_year`` when
            present (CLIMADA path) and ``2020`` otherwise (engine path; matches
            the XLSX loader's default).
        """
        try:
            from backend.engine.adapter import is_engine_exposures, replace_exposures_value

            if ref_year is None:
                ref_year = getattr(exposure, "ref_year", 2020)
            multiplier = (1 + annual_growth) ** (future_year - ref_year)

            if is_engine_exposures(exposure):
                return replace_exposures_value(exposure, exposure.value * multiplier)

            exposure_future = deepcopy(exposure)
            exposure_future.ref_year = future_year
            exposure_future.gdf["value"] = exposure_future.gdf["value"] * multiplier
            return exposure_future
        except Exception as exc:
            logger.log(
                "error", f"An error occurred while trying to calculate exposure growth rate: {exc}"
            )
            return None

    def generate_exposure_geojson(self, exposure: Exposures, country_name: str):
        """
        Generate GeoJSON files for exposure data.

        This method generates GeoJSON files for exposure data based on the provided Exposures
        object and country name. It constructs GeoDataFrames from the exposure data, aggregates
        values based on administrative layers, and converts the data to GeoJSON format.
        The generated GeoJSON files include metadata such as unit and title. If any errors occur
        during the process, it logs an error message.

        :param exposure: The Exposures object containing the exposure data.
        :type exposure: Exposures
        :param country_name: The name of the country for which exposure data is generated.
        :type country_name: str
        """
        try:
            exp_gdf = exposure.gdf
            # Cast DataFrame to GeoDataFrame to avoid issues with gpd.sjoin later
            exposure_gdf = gpd.GeoDataFrame(
                exp_gdf,
                geometry=gpd.points_from_xy(
                    exp_gdf["longitude"], exp_gdf["latitude"], crs="EPSG:4326"
                ),
            )
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            layers = [0, 1, 2]
            all_layers_geojson = {"type": "FeatureCollection", "features": []}

            for layer in layers:
                try:
                    admin_gdf = self.base_handler.get_admin_data(country_iso3, layer)
                    joined_gdf = gpd.sjoin(exposure_gdf, admin_gdf, how="left", predicate="within")
                    aggregated_values = joined_gdf.groupby("id")["value"].sum().reset_index()
                    admin_gdf = admin_gdf.merge(aggregated_values, on="id", how="left")
                    admin_gdf["value"] = admin_gdf["value"].round(2).fillna(0)

                    # Convert each layer to a GeoJSON Feature and add it to the collection
                    layer_features = admin_gdf.__geo_interface__["features"]
                    for feature in layer_features:
                        feature["properties"]["layer"] = layer
                        all_layers_geojson["features"].append(feature)
                    all_layers_geojson["_metadata"] = {
                        "unit": exposure.value_unit,
                        "title": f"Exposure ({exposure.value_unit})",
                    }
                except Exception as e:
                    logger.log("error", f"An error occurred while processing layer {layer}: {e}")

            # Save the combined GeoJSON file
            map_data_filepath = DATA_TEMP_DIR / "exposures_geodata.json"
            with open(map_data_filepath, "w", encoding="utf-8") as f:
                json.dump(all_layers_geojson, f)

        except AttributeError as e:
            logger.log("error", f"Invalid Exposure object: {e}")
        except Exception as e:
            logger.log("error", f"An unexpected error occurred: {e}")

    def generate_exposure_report_dataset(
        self, exposure: Exposures, country_name: str
    ) -> pd.DataFrame:
        """
        Generate a dataset for exposure reporting.

        This method generates a dataset by spatially joining exposure data with administrative boundaries.
        It creates a DataFrame that includes columns for administrative layers, latitude, longitude, and exposure values.

        :param exposure: The Exposures object containing the exposure data.
        :type exposure: Exposures
        :param country_name: The name of the country for which the dataset is generated.
        :type country_name: str
        :return: A DataFrame containing the merged exposure and administrative data.
        :rtype: pd.DataFrame

        Example usage:

        .. code-block:: python

            final_df = base_handler.generate_exposure_report_dataset(exposure, "EGY")
            print(final_df.head())
        """
        try:
            # Cast the exposure data to a GeoDataFrame
            exp_gdf = exposure.gdf
            exposure_gdf = gpd.GeoDataFrame(
                exp_gdf,
                geometry=gpd.points_from_xy(
                    exp_gdf["longitude"], exp_gdf["latitude"], crs="EPSG:4326"
                ),
            )

            # Retrieve the ISO3 country code
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            layers = [1, 2]

            # Copy the exposure_gdf to avoid modifying the original DataFrame
            final_gdf = exposure_gdf.copy()

            # Iterate through each administrative layer
            for layer in layers:
                try:
                    # Retrieve the admin_gdf for the current layer
                    admin_gdf = self.base_handler.get_admin_data(country_iso3, layer)

                    # Perform spatial join with the current layer
                    joined_gdf = gpd.sjoin(final_gdf, admin_gdf, how="left", predicate="within")

                    # Add the admin column for this layer to final_gdf
                    final_gdf[f"admin{layer}"] = joined_gdf["name"]

                except Exception as e:
                    logger.log("error", f"Error processing layer {layer}: {str(e)}")
                    # Continue with the next layer if an error occurs
                    continue

            # Keep only the necessary columns for the final report
            final_df = final_gdf[
                ["admin1", "admin2", "latitude", "longitude", "value", "value_unit"]
            ]

            # Rename the columns
            column_mapping = {
                "admin1": "Admin 1",
                "admin2": "Admin 2",
                "latitude": "Latitude",
                "longitude": "Longitude",
                "value": "Asset Value",
                "value_unit": "Asset UoM",
            }
            # Apply the renaming
            final_df = final_df.rename(columns=column_mapping)

            return final_df

        except AttributeError as e:
            logger.log("error", f"Invalid Exposure object: {str(e)}")
        except Exception as e:
            logger.log("error", f"An unexpected error occurred: {str(e)}")

        return pd.DataFrame()  # Return an empty DataFrame in case of failure
