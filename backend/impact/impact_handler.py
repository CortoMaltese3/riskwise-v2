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
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from backend.constants import DATA_TEMP_DIR
from backend.impact.registry import ImpactFunctionRegistry, load_country_registry, load_registry_from_paths
from backend.logging_config import get_logger
from backend.utils.admin import available_admin_levels, get_admin_data
from backend.utils.country import get_iso3_country_code
from backend.utils.levels import assign_levels

logger = get_logger("backend.impact.impact_handler")

# Map the user-facing hazard names accepted by ``get_impact_function_set``
# (matching ``request_data.hazard_type`` strings such as "flood" / "drought")
# to the engine hazard codes used in the JSON registry. Unknown values are
# passed through unchanged so callers can also supply codes directly.
_HAZARD_SELECTOR_TO_HAZ_TYPE: dict[str, str] = {
    "flood": "FL",
    "drought": "D",
    "heatwave": "HW",
}

_registry_cache: ImpactFunctionRegistry | None = None


def _compute_rp_percentile_levels(
    impact_gdf: pd.DataFrame,
    return_periods: tuple,
    percentiles: tuple = (20, 40, 60, 80),
) -> dict:
    """Per-RP color-scale thresholds derived from positive impact values.

    For each ``rp{N}`` column, takes the strictly-positive entries and returns
    ``[0] + np.percentile(...)`` rounded to 1 decimal — the level boundaries
    the renderer uses for the color scale.

    When a return period has no strictly-positive values across all kept
    points, the slice passed to ``np.percentile`` is empty and numpy raises
    ``IndexError: index -1 is out of bounds for axis 0 with size 0``. The
    caller catches all exceptions and silently skips writing
    ``risks_geodata.json``, producing the white-impact-map symptom. Guard the
    empty slice and emit five zeros so the geojson is still written and the
    layer simply renders with a flat scale.
    """
    out: dict = {}
    n_levels = len(percentiles) + 1
    for rp in return_periods:
        rp_data = impact_gdf[f"rp{rp}"][impact_gdf[f"rp{rp}"] > 0]
        if rp_data.empty:
            out[f"rp{rp}"] = [0.0] * n_levels
            continue
        values = np.percentile(rp_data, percentiles).round(1).tolist()
        values.insert(0, 0)
        out[f"rp{rp}"] = values
    return out


def _calculate_via_engine(
    exposure: Any,
    hazard: Any,
    impfset_specs: Any,
) -> Any:
    """Run an engine impact calc against domain-typed inputs.

    Consumes ``ExposureArrays``, ``HazardArrays``, and a list of
    ``ImpactFunctionSpec``; converts at the boundary via the engine
    adapter; returns the engine ``Impact`` directly.
    """
    from backend.engine.adapter import (
        assign_centroids,
        build_exposures,
        build_hazard,
        build_impfset,
        run_impact,
    )

    try:
        exposure = assign_centroids(exposure, hazard)
        cc_hazard = build_hazard(hazard)
        cc_exposure = build_exposures(exposure)
        cc_impfset = build_impfset(impfset_specs)
        return run_impact(cc_hazard, cc_exposure, cc_impfset, save_mat=True)
    except (AttributeError, TypeError, ValueError, RuntimeError, ImportError) as exception:
        logger.error(f"An error occurred during engine impact calculation: More info: {exception}",
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
            from backend.extensibility.registry import get_registry as get_country_registry

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
        pass

    def get_impact_function_set(self, exposure_type: str, hazard_type: str) -> Any:
        """
        Get the impact function based on the given exposure type and hazard type.

        Selection is a registry lookup — the underlying definitions live in
        ``countries/<ISO3>/impact_functions.json`` and are validated for
        intensity monotonicity, unit consistency, and ``(haz_type, exp_type, id)``
        uniqueness when the registry is loaded. Caller-facing strings
        (``"flood"`` / ``"drought"``) are translated to engine hazard codes;
        callers may also pass a code directly.

        :param exposure_type: The type of exposure.
        :type exposure_type: str
        :param hazard_type: The type of hazard.
        :type hazard_type: str
        :return: An ImpactFuncSet object representing the impact function.
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

    def calculate_impact(self, exposure: Any, hazard: Any, impfset_specs: Any) -> Any:
        """Run an engine impact calc on domain-typed inputs.

        :param exposure: An :class:`ExposureArrays`.
        :param hazard: A :class:`HazardArrays`.
        :param impfset_specs: ``list[ImpactFunctionSpec]`` (e.g. ``entity.impfset_specs``).
        :return: The engine ``Impact`` object, or ``None`` on failure.
        """
        return _calculate_via_engine(exposure, hazard, impfset_specs)

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
        impact: Any,
        exposure: Any,
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

        :param impact: The engine ``Impact`` object holding ``imp_mat`` and ``frequency``.
        :param exposure: The :class:`ExposureArrays` whose ``lat`` / ``lon`` index the
            columns of ``impact.imp_mat`` (the engine ``Impact`` does not store
            per-point coordinates).
        :param country_name: The name of the country for which to generate the GeoJSON file.
        :param return_periods: The return periods for which impact data is available.
        :param asset_type: The type of asset (economic or non_economic).
        """
        try:
            from backend.engine.adapter import (
                local_exceedance_imp as _local_exceedance_imp,
                valid_exposure_mask,
            )

            country_iso3 = get_iso3_country_code(country_name)
            admin_gdf = get_admin_data(country_iso3, 2)
            # ``Impact.imp_mat`` only carries columns for the valid (non-excluded)
            # exposure subset — see climate_lama_engine.ImpactCalc.impact() — so
            # ``lat`` / ``lon`` have to be subset through the same mask before
            # stacking, otherwise np.column_stack hits a length mismatch and
            # silently drops the GeoJSON.
            mask = valid_exposure_mask(exposure)
            lat = np.asarray(exposure.lat, dtype=np.float64)[mask]
            lon = np.asarray(exposure.lon, dtype=np.float64)[mask]
            coords = np.column_stack([lat, lon])
            rp_per_point = _local_exceedance_imp(impact.imp_mat, impact.frequency, return_periods)
            local_exceedance_imp = pd.DataFrame(rp_per_point).T
            data = np.column_stack((coords, local_exceedance_imp))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            impact_df = pd.DataFrame(data, columns=columns)

            # Round the rp values based on the asset_type
            if asset_type == "economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].round(2))
            elif asset_type == "non_economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].apply(np.ceil))

            impact_gdf = gpd.GeoDataFrame(
                impact_df,
                geometry=gpd.points_from_xy(
                    impact_df["longitude"], impact_df["latitude"], crs="EPSG:4326"
                ),
            )

            # Filter impact_gdf to exclude rows where all return period values are zero or negative
            impact_gdf = impact_gdf[
                (impact_gdf[[f"rp{rp}" for rp in return_periods]] > 0).any(axis=1)
            ]
            impact_gdf = impact_gdf.drop(columns=["latitude", "longitude"])
            impact_gdf = impact_gdf.reset_index(drop=True)

            # Calculate percentiles for each return period.
            percentile_values = _compute_rp_percentile_levels(impact_gdf, return_periods)

            # Assign levels based on the percentile values
            impact_gdf = assign_levels(impact_gdf, percentile_values)

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
        except (AttributeError, KeyError, TypeError, ValueError, OSError) as exception:
            logger.error(f"An unexpected error occurred. More info: {exception}")

    def generate_impact_report_dataset(
        self,
        impact: Any,
        exposure: Any,
        country_name: str,
        return_periods: tuple,
        asset_type: str,
    ) -> pd.DataFrame:
        """
        Generate a dataset for impact reporting.

        Spatially joins per-exposure-point return-period intensities with
        administrative boundaries.

        :param impact: The engine ``Impact`` object holding ``imp_mat`` and ``frequency``.
        :param exposure: The :class:`ExposureArrays` providing per-point ``lat`` / ``lon``.
        :param country_name: The country name for the spatial join.
        :param return_periods: Return periods to include.
        :param asset_type: ``"economic"`` or ``"non_economic"``.
        :return: A DataFrame with merged impact and administrative columns.
        """
        try:
            from backend.engine.adapter import (
                local_exceedance_imp as _local_exceedance_imp,
                valid_exposure_mask,
            )

            # Cast impact data to a DataFrame
            mask = valid_exposure_mask(exposure)
            lat = np.asarray(exposure.lat, dtype=np.float64)[mask]
            lon = np.asarray(exposure.lon, dtype=np.float64)[mask]
            coords = np.column_stack([lat, lon])
            rp_per_point = _local_exceedance_imp(impact.imp_mat, impact.frequency, return_periods)
            local_exceedance_imp = pd.DataFrame(rp_per_point).T
            data = np.column_stack((coords, local_exceedance_imp))
            columns = ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]

            impact_df = pd.DataFrame(data, columns=columns)

            # Round the rp values based on the asset_type
            if asset_type == "economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].round(2))
            elif asset_type == "non_economic":
                impact_df.update(impact_df[[f"rp{rp}" for rp in return_periods]].apply(np.ceil))

            impact_gdf = gpd.GeoDataFrame(
                impact_df,
                geometry=gpd.points_from_xy(
                    impact_df["longitude"], impact_df["latitude"], crs="EPSG:4326"
                ),
            )

            # Filter out rows where all return period values are zero
            impact_gdf = impact_gdf[
                (impact_gdf[[f"rp{rp}" for rp in return_periods]] > 0).any(axis=1)
            ]

            # Retrieve the admin_gdf and perform spatial join. Admin levels are
            # data-driven (>= 1), so Greece adds ADM3 municipalities while
            # ADM0-2 countries keep their existing two-level report.
            country_iso3 = get_iso3_country_code(country_name)
            layers = [lvl for lvl in available_admin_levels(country_iso3) if lvl >= 1] or [1, 2]
            final_gdf = impact_gdf.copy()

            # Iterate through each administrative layer
            for layer in layers:
                # Ensure the column exists even if the join below fails.
                final_gdf[f"admin{layer}"] = None
                try:
                    # Retrieve the admin_gdf for the current layer
                    admin_gdf = get_admin_data(country_iso3, layer)

                    # Perform spatial join with the current layer
                    joined_gdf = gpd.sjoin(final_gdf, admin_gdf, how="left", predicate="within")

                    # Add the admin column for this layer to final_gdf
                    final_gdf[f"admin{layer}"] = joined_gdf["name"]
                except (KeyError, ValueError, TypeError, OSError) as e:
                    logger.error(f"Error processing layer {layer}: {str(e)}")
                    # Continue with the next layer if an error occurs
                    continue

            # Keep only the necessary columns for the final report
            admin_cols = [f"admin{lvl}" for lvl in layers]
            final_df = final_gdf[
                admin_cols + ["latitude", "longitude"] + [f"rp{rp}" for rp in return_periods]
            ]

            # Clean up the DataFrame
            final_df = final_df.dropna(subset=admin_cols, how="all")
            final_df = final_df.reset_index(drop=True)

            # Rename the columns
            column_mapping = {f"admin{lvl}": f"Admin {lvl}" for lvl in layers}
            column_mapping.update({"latitude": "Latitude", "longitude": "Longitude"})
            # Add dynamic RP column renaming to the mapping
            column_mapping.update({f"rp{rp}": f"RP{rp}" for rp in return_periods})

            # Apply the renaming
            final_df = final_df.rename(columns=column_mapping)

            return final_df

        except AttributeError as e:
            logger.error(f"Invalid Impact object: {str(e)}")
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"An unexpected error occurred: {str(e)}")

        return pd.DataFrame()  # Return an empty DataFrame in case of failure
