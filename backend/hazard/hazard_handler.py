"""
Module for handling hazard-related operations.

This module contains classes and functions for handling various types of hazards, such as
tropical cyclones, river floods, earthquakes, wildfires, floods, and droughts. It includes
methods for loading hazard data from local files, processing hazard datasets,
and generating hazard GeoJSON files.

Classes:

- `HazardHandler`:
    Class for handling hazard-related operations.

Methods:

- `get_hazard`:
    Retrieves hazard data from a local file based on hazard type, source, and file path.
- `_get_hazard_from_raster`:
    Retrieves hazard data from a raster file.
- `_get_hazard_from_mat`:
    Retrieves hazard data from a MATLAB file.
- `get_hazard_intensity_thres`:
    Retrieves the intensity threshold for a given hazard type.
- `get_circle_radius`:
    Retrieves the radius for generating hazard circles.
- `generate_hazard_geojson`:
    Generates a GeoJSON file containing hazard data.
- `_get_hazard_from_hdf5`:
    Retrieves hazard data from an HDF5 file.
- `get_hazard_from_xlsx`:
    Retrieves hazard data from an Excel file.
- `get_hazard_code`:
    Retrieves the hazard code corresponding to a given hazard type.
- `get_hazard_type`:
    Retrieves the hazard type corresponding to a given hazard code.
"""

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from backend.base_handler import BaseHandler
from backend.constants import (
    DATA_HAZARDS_DIR,
    DATA_TEMP_DIR,
)
from backend.engine.adapter import intensity_to_dense
from backend.logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])


class HazardHandler:
    """
    Class for handling hazard-related operations.

    This class provides methods for retrieving hazard data from various sources, processing
    hazard datasets, and generating hazard GeoJSON files.
    """

    def __init__(self):
        self.base_handler = BaseHandler()

    def get_hazard(
        self,
        hazard_type: str,
        source: str = None,
        filepath: Path = None,
    ) -> Any:
        """
        Retrieve a hazard as an :class:`backend.engine.types.HazardArrays`.

        Loads from a local HDF5 or raster file. When ``source`` is omitted it defaults
        from ``hazard_type`` (drought→hdf5, flood→raster, heatwaves→hdf5).

        :param hazard_type: The type of hazard dataset to retrieve.
        :param source: The source of the hazard dataset (``"hdf5"`` or ``"raster"``).
        :param filepath: The filepath to the hazard dataset file.
        :return: A ``HazardArrays`` (riskwise-side domain dataclass).
        :raises ValueError: If the specified source is invalid.
        """
        if source and source not in ["hdf5", "raster"]:
            status_message = (
                "Error while trying to create hazard object. "
                "Source must be chosen from ['hdf5', 'raster']"
            )
            logger.log("error", status_message)
            raise ValueError(status_message)
        if not source:
            if hazard_type == "drought":
                source = "hdf5"
            if hazard_type == "flood":
                source = "raster"
            if hazard_type == "heatwaves":
                source = "hdf5"

        return self._get_hazard_via_engine(hazard_type, source, filepath)

    def _get_hazard_via_engine(self, hazard_type: str, source: str, filepath: Path) -> Any:
        """Load a hazard via the engine loaders, returning ``HazardArrays``.

        The domain ``HazardArrays`` flows through the scenario pipeline; the
        adapter's ``build_hazard`` is only invoked at the engine boundary
        inside :class:`ImpactHandler` / :class:`CostBenefitHandler`.
        """
        from backend.engine.loaders.hdf5 import load_hazard_h5
        from backend.engine.loaders.raster import load_hazard_raster

        full_path = DATA_HAZARDS_DIR / filepath

        if source == "raster":
            hazard_code = self.get_hazard_code(hazard_type)
            return_periods = list(self.get_custom_rp_per_hazard(hazard_code))
            arrays = load_hazard_raster(
                full_path,
                return_periods=return_periods,
                haz_type=hazard_code,
                intensity_unit="m",
            )
        else:
            arrays = load_hazard_h5(full_path)
            # Drought files use "DR" in the source HDF5; remap to "D" for downstream code.
            if hazard_type == "drought":
                arrays = replace(arrays, haz_type="D")

        return arrays

    def get_hazard_intensity_thres(self, hazard_type: str) -> float:
        """
        Get the intensity threshold for a given hazard type.

        This method returns the intensity threshold corresponding to the specified hazard type.

        :param hazard_type: The type of hazard for which to retrieve the intensity threshold.
        :type hazard_type: str
        :return: The intensity threshold for the specified hazard type.
        :rtype: float
        """
        intensity_thres = -100
        if hazard_type == "RF":
            intensity_thres = 1
        elif hazard_type == "FL":
            intensity_thres = 0
        elif hazard_type == "HW":
            intensity_thres = 0
        elif hazard_type in ["D", "DR"]:
            intensity_thres = -4  # TODO: Test if this is correct
        return intensity_thres

    def get_hazard_intensity_units_from_entity(self, entity: Any) -> str:
        """
        Return the intensity unit for the entity's impact functions.

        Reads from :attr:`EntityBundle.impfset_specs`. The entity loader
        already validates that all specs sharing a ``haz_type`` use the
        same ``intensity_unit`` (see ``_validate_specs`` in the xlsx
        loader), so any matching spec yields the canonical answer.

        :param entity: An :class:`EntityBundle` carrying exposures + specs.
        :return: The intensity unit string, or ``""`` when no specs exist.
        """
        specs = getattr(entity, "impfset_specs", None) or []
        for spec in specs:
            return getattr(spec, "intensity_unit", "") or ""
        return ""

    def get_custom_rp_per_hazard(self, hazard_code: str) -> tuple:
        """
        This method returns the return periods in tuple form, from a UNU-EHS tailored
        hazard file.

        :param hazard_code: The hazard code.
        :type hazard_code: str
        :return: Return periods.
        :rtype: tuple
        """
        if hazard_code in ["FL"]:
            return (2, 5, 10, 25)
        elif hazard_code in ["D", "HW"]:
            return (10, 25, 50, 75, 100)
        return (10, 25, 50, 100)

    def get_circle_radius(self, hazard_type: str) -> int:
        """
        Return the radius of a circle based on the hazard type.

        This method returns the radius of a circle based on the specified hazard type.

        :param hazard_type: The type of hazard.
        :type hazard_type: str
        :return: The radius of the circle.
        :rtype: int
        """
        radius = 2000
        if hazard_type == "D":
            radius = 11000
        if hazard_type == "FL":
            radius = 2000
        if hazard_type == "HW":
            radius = 9000
        return radius

    def generate_hazard_geojson(
        self,
        hazard: Any,
        country_name: str,
        return_periods: tuple,
    ):
        """
        Generate GeoJSON data for hazard points.

        This method generates GeoJSON data for hazard points based on the specified hazard,
        country name, and return periods.

        :param hazard: The hazard object.
        :type hazard: Hazard
        :param country_name: The name of the country.
        :type country_name: str
        :param return_periods: Tuple of return periods, defaults to (10, 15, 20, 25).
        :type return_periods: tuple, optional
        """
        try:
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            admin_gdf = self.base_handler.get_admin_data(country_iso3, 2)

            intensity_dense = intensity_to_dense(hazard.intensity)
            lat = np.asarray(hazard.centroid_lat, dtype=np.float64)
            lon = np.asarray(hazard.centroid_lon, dtype=np.float64)
            # The UNU EHS ERA hazard datasets store RP-banded intensities directly,
            # so each event row already corresponds to a return period. Match that
            # ordering to ``return_periods`` rather than re-computing exceedance.
            local_exceedance_inten = pd.DataFrame(
                intensity_dense.T, columns=[f"rp{year}" for year in return_periods]
            )
            data = np.column_stack((lat, lon, local_exceedance_inten))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            hazard_df = pd.DataFrame(data, columns=columns)

            # Round the hazard rp values to 2 decimal places. Update is vectorized and efficient
            # for large datasets
            hazard_df.update(hazard_df[[f"rp{rp}" for rp in return_periods]].round(1))
            hazard_gdf = gpd.GeoDataFrame(
                hazard_df,
                geometry=gpd.points_from_xy(
                    hazard_df["longitude"], hazard_df["latitude"], crs="EPSG:4326"
                ),
            )

            # Filter hazard_gdf to exclude rows where all return period values are zero
            hazard_gdf = hazard_gdf[
                (hazard_gdf[[f"rp{rp}" for rp in return_periods]] != 0).any(axis=1)
            ]

            # Calculate percentiles for each return period
            percentile_values = {}
            percentiles = (20, 40, 60, 80)
            for rp in return_periods:
                rp_data = hazard_gdf[f"rp{rp}"]
                percentile_values[f"rp{rp}"] = np.percentile(rp_data, percentiles).round(1).tolist()
                if hazard.haz_type == "D":
                    percentile_values[f"rp{rp}"].reverse()
                    percentile_values[f"rp{rp}"].append(-4)
                else:
                    percentile_values[f"rp{rp}"].insert(0, 0)

            # Assign levels based on the percentile values
            hazard_gdf = self.base_handler.assign_levels(hazard_gdf, percentile_values)

            # Spatial join with administrative area
            joined_gdf = gpd.sjoin(hazard_gdf, admin_gdf, how="left", predicate="within")
            # Remove points outside of the country
            joined_gdf = joined_gdf[~joined_gdf["country"].isna()]
            joined_gdf = joined_gdf.drop(columns=["latitude", "longitude", "index_right"])
            joined_gdf = joined_gdf.reset_index(drop=True)

            radius = self.get_circle_radius(hazard.haz_type)

            unit = hazard.intensity_unit or ""
            # Convert to GeoJSON for this layer and add to all_layers_geojson
            hazard_geojson = joined_gdf.__geo_interface__
            hazard_geojson["_metadata"] = {
                "percentile_values": percentile_values,
                "radius": radius,
                "return_periods": return_periods,
                "title": f"Hazard ({unit})" if unit else "Hazard",
                "unit": unit,
            }

            # Save the combined GeoJSON file
            map_data_filepath = DATA_TEMP_DIR / "hazards_geodata.json"
            with open(map_data_filepath, "w", encoding="utf-8") as f:
                json.dump(hazard_geojson, f)
        except Exception as exception:
            logger.log("error", f"An unexpected error occurred. More info: {exception}")

    def get_hazard_code(self, hazard_type: str) -> str:
        """
        Retrieve the code corresponding to a given hazard type.

        This function maps a hazard type to its corresponding hazard code. If the hazard type
        is not recognized, it raises a ValueError.

        :param hazard_type: The type of hazard as a string.
        :type hazard_type: str
        :return: The hazard code corresponding to the provided hazard type.
        :rtype: str
        :raises ValueError: If the hazard type is not recognized.
        """
        # Map hazard types to their corresponding codes
        hazard_codes = {
            "tropical_cyclone": "TC",
            "river_flood": "RF",
            "storm_europe": "WS",
            "wildfire": "BF",
            "earthquake": "EQ",
            "flood": "FL",
            "flash_flood": "FL",
            "drought": "D",
            "heatwaves": "HW",
        }

        # Retrieve the code for the given hazard type
        code = hazard_codes.get(hazard_type, None)

        # Raise an exception if the hazard type is not found
        if code is None:
            # raise ValueError(f"Hazard type '{hazard_type}' is not recognized.")
            logger.log(
                "error",
                f"Hazard type '{hazard_type}' is not recognized.",
            )

        return code

    def get_hazard_name(self, hazard_code: str) -> str:
        """
        Retrieve the hazard type corresponding to a given hazard code.

        This function maps a hazard code to its corresponding hazard type. If the hazard code
        is not recognized, it raises a ValueError.

        :param hazard_code: The hazard code as a string.
        :type hazard_code: str
        :return: The hazard type corresponding to the provided hazard code.
        :rtype: str
        :raises ValueError: If the hazard code is not recognized.
        """
        # Map hazard codes to their corresponding types
        hazard_names = {
            "TC": "tropical_cyclone",
            "RF": "river_flood",
            "WS": "storm_europe",
            "BF": "wildfire",
            "EQ": "earthquake",
            "FL": "flood",
            "D": "drought",
            "HW": "heatwaves",
        }

        # Retrieve the hazard type for the given hazard code
        hazard_type = hazard_names.get(hazard_code, None)

        # Raise an exception if the hazard code is not found
        if hazard_type is None:
            logger.log(
                "error",
                f"Hazard code '{hazard_code}' is not recognized.",
            )

        return hazard_type

    def get_hazard_filename(self, hazard_code: str, country_code: str, scenario: str) -> str:
        """
        Get the hazard filename based on the request parameters.
        This helper method sets the hazard filename in a specific format to be searched
        in the data/hazards directory

        :param is_historical: Flag indicating whether historical hazard should be retrieved.
        :type is_historical: bool
        :return: The hazard filename.
        :rtype: str
        """
        if hazard_code == "D":
            hazard_filename = f"hazard_{hazard_code}_{country_code}_{scenario}.h5"
        elif hazard_code == "FL":
            hazard_filename = f"hazard_{hazard_code}_{country_code}_{scenario}.tif"
        elif hazard_code == "HW":
            hazard_filename = f"hazard_{hazard_code}_{country_code}_{scenario}.h5"
        return hazard_filename

    def generate_hazard_report_dataset(
        self, hazard: Any, country_name: str, return_periods: tuple
    ) -> pd.DataFrame:
        """
        Generate a dataset for hazard reporting.

        This method generates a dataset by spatially joining hazard data with administrative boundaries.
        It creates a DataFrame that includes columns for hazard return periods and administrative layers.

        :param hazard: The Hazard object containing the hazard data.
        :type hazard: Hazard
        :param country_name: The name of the country for which the dataset is generated.
        :type country_name: str
        :param return_periods: Tuple of return periods to include in the dataset.
        :type return_periods: tuple
        :return: A DataFrame containing the merged hazard and administrative data.
        :rtype: pd.DataFrame

        Example usage:

        .. code-block:: python

            final_df = base_handler.generate_hazard_report_dataset(hazard, "EGY", (10, 15, 20, 25))
            print(final_df.head())
        """
        try:
            # Cast hazard data to a DataFrame
            intensity_dense = intensity_to_dense(hazard.intensity)
            lat = np.asarray(hazard.centroid_lat, dtype=np.float64)
            lon = np.asarray(hazard.centroid_lon, dtype=np.float64)
            local_exceedance_inten = pd.DataFrame(
                intensity_dense.T, columns=[f"rp{year}" for year in return_periods]
            )
            data = np.column_stack((lat, lon, local_exceedance_inten))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            hazard_df = pd.DataFrame(data, columns=columns)
            hazard_df.update(hazard_df[[f"rp{rp}" for rp in return_periods]].round(1))
            hazard_gdf = gpd.GeoDataFrame(
                hazard_df,
                geometry=gpd.points_from_xy(
                    hazard_df["longitude"], hazard_df["latitude"], crs="EPSG:4326"
                ),
            )

            # Filter out rows where all return period values are zero
            hazard_gdf = hazard_gdf[
                (hazard_gdf[[f"rp{rp}" for rp in return_periods]] != 0).any(axis=1)
            ]

            # Retrieve the admin_gdf and perform spatial join
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            layers = [1, 2]
            final_gdf = hazard_gdf.copy()

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
                ["admin1", "admin2", "latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]
            ]

            # Clean up the DataFrame
            final_df = final_df.dropna(subset=["admin1", "admin2"], how="all")
            final_df = final_df.reset_index(drop=True)

            # Rename the columns
            column_mapping = {
                "admin1": "Admin 1",
                "admin2": "Admin 2",
                "latitude": "Latitude",
                "longitude": "Longitude",
            }
            # Add dynamic RP column renaming to the mapping
            column_mapping.update({f"rp{rp}": f"RP{rp}" for rp in return_periods})

            # Apply the renaming
            final_df = final_df.rename(columns=column_mapping)

            return final_df

        except AttributeError as e:
            logger.log("error", f"Invalid Hazard object: {str(e)}")
        except Exception as e:
            logger.log("error", f"An unexpected error occurred: {str(e)}")

        return pd.DataFrame()  # Return an empty DataFrame in case of failure
