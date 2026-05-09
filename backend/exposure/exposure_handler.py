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
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from backend.base_handler import BaseHandler
from backend.constants import DATA_TEMP_DIR
from backend.logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])


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

    def get_exposure(self, filepath: Path, source: str | None = None) -> Any:
        """Load an exposure dataset from an XLSX or GeoPackage file.

        Routes through :func:`backend.engine.loaders.xlsx.load_entity_xlsx` (for ``.xlsx``
        entity files) or :func:`backend.engine.loaders.gpkg.load_exposures_gpkg`
        (for ``.gpkg`` exposure files), then ``backend.engine.adapter.build_exposures``.

        :param filepath: Path to an entity XLSX or exposure GeoPackage file.
        :param source: Optional explicit source (``"xlsx"`` or ``"gpkg"``).
            When omitted, derived from the file extension.
        :return: A ``climate_lama_engine.Exposures``.
        """
        source = source or _infer_source(filepath)
        if source not in ("xlsx", "gpkg"):
            raise ValueError(
                f"Unsupported exposure source {source!r}; expected 'xlsx' or 'gpkg'"
            )
        return self._get_exposure_via_engine(filepath, source)

    def _get_exposure_via_engine(self, filepath: Path, source: str) -> Any:
        """Load an exposure via engine loaders + ``build_exposures``."""
        from backend.engine.adapter import build_exposures
        from backend.engine.loaders.gpkg import load_exposures_gpkg
        from backend.engine.loaders.xlsx import load_entity_xlsx

        if source == "xlsx":
            arrays = load_entity_xlsx(Path(filepath)).exposures
        else:
            arrays = load_exposures_gpkg(Path(filepath))
        return build_exposures(arrays)

    def get_growth_exposure(
        self, exposure: Any, annual_growth: float, future_year: int, ref_year: int | None = None
    ) -> Any:
        """Apply an annual-growth multiplier to an exposure's value array.

        Multiplier: ``(1 + annual_growth) ** (future_year - ref_year)``. Returns a
        new ``cc.Exposures`` with multiplied ``value`` array.

        :param exposure: A ``climate_lama_engine.Exposures``.
        :param annual_growth: Annual growth rate (e.g. ``0.02`` for 2 %/yr).
        :param future_year: Target year for the multiplied exposure.
        :param ref_year: Reference year. Defaults to ``exposure.ref_year`` when
            present, ``2020`` otherwise (matches the XLSX loader's default).
        """
        try:
            from backend.engine.adapter import replace_exposures_value

            if ref_year is None:
                ref_year = getattr(exposure, "ref_year", 2020)
            multiplier = (1 + annual_growth) ** (future_year - ref_year)
            return replace_exposures_value(exposure, exposure.value * multiplier)
        except (AttributeError, TypeError, ValueError, ImportError) as exc:
            logger.log(
                "error", f"An error occurred while trying to calculate exposure growth rate: {exc}"
            )
            return None

    def generate_exposure_geojson(self, exposure: Any, country_name: str):
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
            lat = np.asarray(exposure.lat, dtype=np.float64)
            lon = np.asarray(exposure.lon, dtype=np.float64)
            exposure_gdf = gpd.GeoDataFrame(
                {
                    "value": np.asarray(exposure.values, dtype=np.float64),
                    "value_unit": exposure.value_unit,
                    "latitude": lat,
                    "longitude": lon,
                },
                geometry=gpd.points_from_xy(lon, lat, crs="EPSG:4326"),
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
                except (KeyError, ValueError, TypeError, OSError) as e:
                    logger.log("error", f"An error occurred while processing layer {layer}: {e}")

            # Save the combined GeoJSON file
            map_data_filepath = DATA_TEMP_DIR / "exposures_geodata.json"
            with open(map_data_filepath, "w", encoding="utf-8") as f:
                json.dump(all_layers_geojson, f)

        except AttributeError as e:
            logger.log("error", f"Invalid Exposure object: {e}")
        except (KeyError, ValueError, TypeError, OSError) as e:
            logger.log("error", f"An unexpected error occurred: {e}")

    def generate_exposure_report_dataset(
        self, exposure: Any, country_name: str
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
            lat = np.asarray(exposure.lat, dtype=np.float64)
            lon = np.asarray(exposure.lon, dtype=np.float64)
            exposure_gdf = gpd.GeoDataFrame(
                {
                    "value": np.asarray(exposure.values, dtype=np.float64),
                    "value_unit": exposure.value_unit,
                    "latitude": lat,
                    "longitude": lon,
                },
                geometry=gpd.points_from_xy(lon, lat, crs="EPSG:4326"),
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

                except (KeyError, ValueError, TypeError, OSError) as e:
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
        except (KeyError, ValueError, TypeError) as e:
            logger.log("error", f"An unexpected error occurred: {str(e)}")

        return pd.DataFrame()  # Return an empty DataFrame in case of failure
