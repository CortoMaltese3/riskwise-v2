"""
Module to handle the impact calculation based on exposure and hazard data.

This module provides functionality to calculate the impact of hazards on different exposure types
using impact functions. It includes methods to retrieve the appropriate impact function set
based on the given exposure and hazard types, calculate the impact of hazards on exposures,
generate impact GeoJSON files, and handle administrative data.

Classes:

- `ImpactHandler`:
    Provides methods to handle impact calculation and data retrieval.

Methods:

- `get_impact_function_set`:
    Retrieves the impact function set based on the given exposure and hazard types.
- `get_impf_id`:
    Retrieves the impact function ID based on the hazard type.
- `calculate_impact`:
    Calculates the impact of hazards on exposures.
- `get_circle_radius`:
    Retrieves the radius for impact visualization based on the hazard type.
- `generate_impact_geojson`:
    Generates impact GeoJSON files for visualization.
"""

import json
import os

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

from climada.engine import Impact, ImpactCalc
from climada.entity import Exposures
from climada.entity.impact_funcs import ImpactFuncSet
from climada.hazard import Hazard

from base_handler import BaseHandler
from constants import DATA_TEMP_DIR
from impact.registry import ImpactFunctionRegistry, load_country_registry, load_registry_from_paths
from logger_config import LoggerConfig

logger = LoggerConfig(logger_types=["file"])

# Map the user-facing hazard names accepted by ``get_impact_function_set``
# (matching ``request_data.hazard_type`` strings such as "flood" / "drought")
# to the CLIMADA hazard codes used in the JSON registry. Unknown values are
# passed through unchanged so callers can also supply CLIMADA codes directly.
_HAZARD_SELECTOR_TO_HAZ_TYPE: dict[str, str] = {
    "flood": "FL",
    "drought": "D",
    "heatwave": "HW",
}

_registry_cache: ImpactFunctionRegistry | None = None


def _calculate_via_climada(
    exposure: Exposures,
    hazard: Hazard,
    impact_function_set: ImpactFuncSet,
) -> Impact | None:
    try:
        impact_calc = ImpactCalc(
            exposures=exposure,
            impfset=impact_function_set,
            hazard=hazard,
        )
        return impact_calc.impact(save_mat=True, assign_centroids=True)
    except Exception as exception:
        logger.log("error", f"An error occurred during impact calculation: More info: {exception}")
        return None


def _calculate_via_engine(
    exposure: Exposures,
    hazard: Hazard,
    impact_function_set,
) -> Impact | None:
    from backend.engine.adapter import build_exposures, build_hazard, run_impact
    from backend.engine.types import ExposureArrays, HazardArrays

    try:
        exposure.assign_centroids(hazard, overwrite=False)

        gdf = exposure.gdf
        centr_col = f"centr_{hazard.haz_type}"
        centroid_idx = gdf[centr_col].values

        impf_col = f"impf_{hazard.haz_type}"
        impf_id = (
            gdf[impf_col].values
            if impf_col in gdf.columns
            else np.ones(len(gdf), dtype=np.int64)
        )

        hazard_arrays = HazardArrays(
            haz_type=hazard.haz_type,
            intensity_unit=hazard.units,
            intensity=hazard.intensity,
            frequency=hazard.frequency,
            centroid_lat=hazard.centroids.lat,
            centroid_lon=hazard.centroids.lon,
            event_names=tuple(hazard.event_name) if hazard.event_name else None,
        )

        exposure_arrays = ExposureArrays(
            values=gdf["value"].values,
            centroid_idx=centroid_idx,
            impf_id=impf_id,
            lat=gdf.geometry.y.values,
            lon=gdf.geometry.x.values,
            value_unit=getattr(exposure, "value_unit", "USD"),
        )

        cc_hazard = build_hazard(hazard_arrays)
        cc_exposure = build_exposures(exposure_arrays)

        return run_impact(cc_hazard, cc_exposure, impact_function_set, save_mat=True)
    except Exception as exception:
        logger.log(
            "error",
            f"An error occurred during engine impact calculation: More info: {exception}",
        )
        return None


def _get_registry() -> ImpactFunctionRegistry:
    """Lazily load and cache the impact-function registry on first use.

    Without the ``RISKWISE_IMPACT_COUNTRIES`` override, the registry is
    built from every country the extensibility layer knows about — shipped
    built-ins plus custom drop-ins under ``<user-data>/countries/``. With
    the override, only the listed built-in codes are read (custom
    countries are ignored), giving ops a hard switch for forensic reruns.
    """
    global _registry_cache
    if _registry_cache is None:
        env = os.environ.get("RISKWISE_IMPACT_COUNTRIES")
        if env:
            codes = tuple(c.strip() for c in env.split(",") if c.strip())
            _registry_cache = load_country_registry(codes)
        else:
            # Deferred import so this module stays importable in tests
            # that don't spin up the full registry.
            from extensibility.registry import get_registry as get_country_registry

            _registry_cache = load_registry_from_paths(
                get_country_registry().impact_function_paths()
            )
    return _registry_cache


def reset_registry_cache() -> None:
    """Drop the cached registry. Tests call this after mutating user-data."""
    global _registry_cache
    _registry_cache = None


class ImpactHandler:
    """
    Class for handling impact-related operations.

    This class provides methods for generating impact data from various sources, processing
    impact datasets, and generating impact GeoJSON files.
    """

    def __init__(self) -> None:
        self.base_handler = BaseHandler()

    def get_impact_function_set(self, exposure_type: str, hazard_type: str) -> ImpactFuncSet:
        """
        Get the impact function based on the given exposure type and hazard type.

        Selection is now a registry lookup — the underlying definitions live in
        ``countries/<ISO3>/impact_functions.json`` and are validated for
        intensity monotonicity, unit consistency, and ``(haz_type, exp_type, id)``
        uniqueness when the registry is loaded. Caller-facing strings
        (``"flood"`` / ``"drought"``) are translated to CLIMADA hazard codes;
        callers may also pass a CLIMADA code directly.

        :param exposure_type: The type of exposure.
        :type exposure_type: str
        :param hazard_type: The type of hazard.
        :type hazard_type: str
        :return: An ImpactFuncSet object representing the impact function.
        :rtype: ImpactFuncSet
        """
        haz_type = _HAZARD_SELECTOR_TO_HAZ_TYPE.get(hazard_type, hazard_type)
        return _get_registry().get_set(exposure_type, haz_type)

    def get_impf_id(self, hazard_type: str) -> int:
        """
        Get the impact function ID for a specified hazard type.

        This method retrieves the impact function ID for the specified hazard type
        based on predefined mappings. If the hazard type is not found in the mappings,
        it returns the default impact function ID.

        :param hazard_type: The type of hazard for which to retrieve the impact function ID.
        :type hazard_type: str
        :return: The impact function ID corresponding to the specified hazard type.
        :rtype: int
        """
        impf_ids = {"TC": 1, "RF": 3, "BF": 4, "FL": 5, "EQ": 6, "DEFAULT": 9}
        return impf_ids.get(hazard_type, impf_ids["DEFAULT"])

    def calculate_impact(
        self, exposure: Exposures, hazard: Hazard, impact_function_set: ImpactFuncSet
    ) -> Impact:
        """
        Calculate the impact of a hazard on exposure data using specified impact functions.

        Routes to the engine backend by default; setting
        ``RISKWISE_ENGINE_BACKEND=climada`` selects the legacy CLIMADA path.

        :param exposure: The exposure data.
        :type exposure: Exposures
        :param hazard: The hazard data.
        :type hazard: Hazard
        :param impact_function_set: The set of impact functions corresponding to the hazard.
        :type impact_function_set: ImpactFuncSet
        :return: The Impact object representing the calculated impact, or None if an error occurs.
        :rtype: Impact
        """
        if os.environ.get("RISKWISE_ENGINE_BACKEND", "engine") == "engine":
            return _calculate_via_engine(exposure, hazard, impact_function_set)
        return _calculate_via_climada(exposure, hazard, impact_function_set)

    def get_circle_radius(self, hazard_type: str, country_iso3: str, exposure_type: str) -> int:
        """
        Get the radius for a circle based on the specified hazard type.

        This method returns the radius for a circle based on the hazard type.
        For drought (hazard_type='D'), the radius is set to 11000 meters.
        For other hazard types, the default radius is set to 2000 meters.

        :param hazard_type: The type of hazard.
        :type hazard_type: str
        :return: The radius of the circle.
        :rtype: int
        """
        if country_iso3 == "THA":
            if hazard_type == "HW":
                # All non economic assets appear better on map with 100m radius
                # due to the high density of assets in the area.
                return 100
            elif hazard_type == "D":
                if exposure_type in [
                    "tree_crops",
                    "grass_crops",
                ]:
                    return 11000
                elif exposure_type in [
                    "water_users",
                    "wet_markets",
                    "tree_crops_farmers",
                    "grass_crops_farmers",
                ]:
                    return 100
            elif hazard_type == "FL":
                # All economic and non economic assets appear better on map with 100m radius
                # due to the high density of assets in the area.
                return 100

        if country_iso3 == "EGY":
            if hazard_type == "HW":
                # Hotels have extremely high density so an extra small radius is required
                if exposure_type in ["hotels"]:
                    return 10
                # All other economic and non economic assets appear better on map with 100m radius
                # due to the high density of assets in the area.
                return 100
            if hazard_type == "FL":
                if exposure_type in ["students"]:
                    return 2000
                elif exposure_type in [
                    "diarrhea_patients",
                    "crops",
                    "livestock",
                    "hotels",
                    "power_plants",
                    "roads",
                ]:
                    return 10

        return 2000

    def generate_impact_geojson(
        self,
        impact: Impact,
        country_name: str,
        return_periods: tuple = (25, 20, 15, 10),
        asset_type: str = "economic",
        exposure_type: str = None,
    ):
        """
        Generate a GeoJSON file representing impact data.

        This method generates a GeoJSON file representing impact data for visualization.
        It retrieves administrative area information for the specified country,
        then spatially joins it with the impact data. The resulting GeoJSON file includes
        information about impact values at different return periods, along with metadata
        such as the unit and radius.

        :param impact: The impact data to be visualized.
        :type impact: Impact
        :param country_name: The name of the country for which to generate the GeoJSON file.
        :type country_name: str
        :param return_periods: The return periods for which impact data is available.
        :type return_periods: tuple, optional
        :param asset_type: The type of asset (economic or non_economic).
        :type asset_type: str, optional
        """
        try:
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            admin_gdf = self.base_handler.get_admin_data(country_iso3, 2)
            coords = np.array(impact.coord_exp)
            local_exceedance_imp = impact.local_exceedance_imp(return_periods)
            local_exceedance_imp = pd.DataFrame(local_exceedance_imp).T
            data = np.column_stack((coords, local_exceedance_imp))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            impact_df = pd.DataFrame(data, columns=columns)

            # Round the rp values based on the asset_type
            if asset_type == "economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].round(2))
            elif asset_type == "non_economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].apply(np.ceil))

            geometry = [Point(xy) for xy in zip(impact_df["longitude"], impact_df["latitude"])]
            impact_gdf = gpd.GeoDataFrame(impact_df, geometry=geometry, crs="EPSG:4326")

            # Filter impact_gdf to exclude rows where all return period values are zero or negative
            impact_gdf = impact_gdf[
                (impact_gdf[[f"rp{rp}" for rp in return_periods]] > 0).any(axis=1)
            ]
            impact_gdf = impact_gdf.drop(columns=["latitude", "longitude"])
            impact_gdf = impact_gdf.reset_index(drop=True)

            # Calculate percentiles for each return period
            percentile_values = {}
            percentiles = (20, 40, 60, 80)
            for rp in return_periods:
                rp_data = impact_gdf[f"rp{rp}"][impact_gdf[f"rp{rp}"] > 0]
                percentile_values[f"rp{rp}"] = np.percentile(rp_data, percentiles).round(1).tolist()
                percentile_values[f"rp{rp}"].insert(0, 0)

            # Assign levels based on the percentile values
            impact_gdf = self.base_handler.assign_levels(impact_gdf, percentile_values)

            # Spatial join with administrative areas
            joined_gdf = gpd.sjoin(impact_gdf, admin_gdf, how="left", predicate="within")
            joined_gdf = joined_gdf[~joined_gdf["country"].isna()]

            radius = self.get_circle_radius(impact.haz_type, country_iso3, exposure_type)
            # Convert to GeoJSON for this layer and add to all_layers_geojson
            impact_geojson = joined_gdf.__geo_interface__
            impact_geojson["_metadata"] = {
                "percentile_values": percentile_values,
                "radius": radius,
                "return_periods": return_periods,
                "title": f"Risk ({impact.unit})",
                "unit": impact.unit,
            }

            # Save the combined GeoJSON file
            map_data_filepath = DATA_TEMP_DIR / "risks_geodata.json"
            with open(map_data_filepath, "w", encoding="utf-8") as f:
                json.dump(impact_geojson, f)
        except Exception as exception:
            logger.log("error", f"An unexpected error occurred. More info: {exception}")

    def generate_impact_report_dataset(
        self, impact: Impact, country_name: str, return_periods: tuple, asset_type: str
    ) -> pd.DataFrame:
        """
        Generate a dataset for impact reporting.

        This method generates a dataset by spatially joining impact data with administrative boundaries.
        It creates a DataFrame that includes columns for impact return periods and administrative layers.

        :param impact: The Impact object containing the impact data.
        :type impact: Impact
        :param country_name: The name of the country for which the dataset is generated.
        :type country_name: str
        :param return_periods: Tuple of return periods to include in the dataset.
        :type return_periods: tuple
        :param asset_type: The type of asset (economic or non_economic).
        :type asset_type: str
        :return: A DataFrame containing the merged impact and administrative data.
        :rtype: pd.DataFrame

        Example usage:

        .. code-block:: python

            final_df = base_handler.generate_impact_report_dataset(impact, "EGY", (10, 15, 20, 25), "economic")
            print(final_df.head())
        """
        try:
            # Cast impact data to a DataFrame
            coords = np.array(impact.coord_exp)
            local_exceedance_imp = impact.local_exceedance_imp(return_periods)
            local_exceedance_imp = pd.DataFrame(local_exceedance_imp).T
            data = np.column_stack((coords, local_exceedance_imp))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            impact_df = pd.DataFrame(data, columns=columns)

            # Round the rp values based on the asset_type
            if asset_type == "economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].round(2))
            elif asset_type == "non_economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].apply(np.ceil))

            geometry = [Point(xy) for xy in zip(impact_df["longitude"], impact_df["latitude"])]
            impact_gdf = gpd.GeoDataFrame(impact_df, geometry=geometry, crs="EPSG:4326")

            # Filter out rows where all return period values are zero
            impact_gdf = impact_gdf[
                (impact_gdf[[f"rp{rp}" for rp in return_periods]] > 0).any(axis=1)
            ]

            # Retrieve the admin_gdf and perform spatial join
            country_iso3 = self.base_handler.get_iso3_country_code(country_name)
            layers = [1, 2]
            final_gdf = impact_gdf.copy()

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
            logger.log("error", f"Invalid Impact object: {str(e)}")
        except Exception as e:
            logger.log("error", f"An unexpected error occurred: {str(e)}")

        return pd.DataFrame()  # Return an empty DataFrame in case of failure
