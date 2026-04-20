"""
Module to handle running scenarios based on provided parameters.

This module provides functionality to run scenarios based on parameters such as hazard type,
exposure type, country name, climate scenario type, and future year.
It contains classes and methods to orchestrate the execution of ERA and custom scenarios,
conduct cost-benefit analysis, calculate impacts, generate map data files, and prepare responses.

Classes:

- `RunScenario`:
    Orchestrates the execution of scenarios based on provided parameters.

Methods:

- `run_scenario`:
    Entry point to run a scenario based on provided request parameters.
"""

import json
import sys
from dataclasses import dataclass, field
from time import time
from typing import Any

import numpy as np
from base_handler import BaseHandler
from climada.entity import DiscRates
from constants import DATA_TEMP_DIR
from costben.costben_handler import CostBenefitHandler
from countries.loader import CountryConfigError, load_country_config
from entity.entity_handler import EntityHandler
from exposure.exposure_handler import ExposureHandler
from hazard.hazard_handler import HazardHandler
from impact.impact_handler import ImpactHandler
from logger_config import LoggerConfig


@dataclass
class RequestData:
    """
    Data class to encapsulate request parameters for running scenarios.

    This class stores the parameters required for running scenarios, such as hazard type,
    exposure type, country name, scenario details, and time horizon. It also handles post-
    initialization operations to ensure the parameters are cleansed and processed appropriately.
    """

    adaptation_measures: list[str]
    annual_growth: float
    country_name: str
    entity_filename: str
    exposure_economic: str
    exposure_non_economic: str
    hazard_filename: str
    hazard_type: str
    is_era: bool
    scenario: str
    time_horizon: tuple[int, int]
    asset_type: str = field(init=False)
    exposure_type: str = field(init=False)
    country_code: str = field(init=False)
    hazard_code: str = field(init=False)
    ref_year: int = field(init=False)
    future_year: int = field(init=False)
    base_handler: Any = field(default_factory=BaseHandler)
    hazard_handler: Any = field(default_factory=HazardHandler)

    def __post_init__(self):
        # Cleanse and beautify request parameters
        self.exposure_type = self.exposure_economic or self.exposure_non_economic
        self.country_code = self.base_handler.get_iso3_country_code(self.country_name)
        self.hazard_code = self.hazard_handler.get_hazard_code(self.hazard_type)
        self.ref_year = self.time_horizon[0]  # Set to 2024 if Era project or not selected
        self.future_year = self.time_horizon[1]  # Set to 2050 if Era project or not selected
        self.asset_type = "economic" if self.exposure_economic else "non_economic"


class Status:
    """
    Helper class to handle status codes and messages.
    """

    def __init__(self):
        self.code = 2000
        self.message = "Scenario run successfully."

    def set_error(self, code: int, message: str):
        """
        Set error status code and message.

        :param code: The error code.
        :type code: int
        :param message: The error message.
        :type message: str
        """
        self.code = code
        self.message = message

    def get_status(self) -> dict:
        """
        Get the status dictionary.

        :return: The status dictionary containing the code and message.
        :rtype: dict
        """
        return {"code": self.code, "message": self.message}


class RunScenario:
    """
    Class for orchestrating the execution of scenarios based on provided parameters.

    This class provides functionality to run scenarios based on parameters such as hazard type,
    exposure type, country name, climate scenario type, and future year. It orchestrates the
    execution of ERA and custom scenarios, conducts cost-benefit analysis, calculates impacts,
    generates map data files, and prepares responses.
    """

    def __init__(self, request):
        # Initialize handler instances
        self._initialize_handlers()
        # Initialize data folder and subfolders if not exist
        self.base_handler.initalize_data_directories()
        # Clear previously generated exposure/hazard/impact maps and temp directory
        self._clear()
        # Initialize logger
        self.logger = LoggerConfig(logger_types=["file"])
        # Get request parameters from the UI
        self.request_data = self._extract_request_data(request)
        # Set default successful status code and message
        self.status = Status()
        # Clear previously generated maps and geojson datasets from temp directory
        self._clear()

    def _initialize_handlers(self):
        """Initialize handlers."""
        self.base_handler = BaseHandler()
        self.costben_handler = CostBenefitHandler()
        self.entity_handler = EntityHandler()
        self.exposure_handler = ExposureHandler()
        self.hazard_handler = HazardHandler()
        self.impact_handler = ImpactHandler()

    def _extract_request_data(self, request):
        """
        Extract request parameters from the UI and create a RequestData object.

        :param request: The request object containing parameters.
        :type request: dict
        :return: RequestData object containing sanitized parameters.
        :rtype: RequestData
        """
        return RequestData(
            adaptation_measures=request.get("adaptationMeasures", []),
            annual_growth=request.get("annualGrowth", 0),
            country_name=self.base_handler.sanitize_country_name(request.get("countryName", "")),
            entity_filename=request.get("exposureFile", ""),
            exposure_economic=request.get("exposureEconomic", ""),
            exposure_non_economic=request.get("exposureNonEconomic", ""),
            hazard_filename=request.get("hazardFile", ""),
            hazard_type=request.get("hazardType", ""),
            is_era=request.get("isEra", False),
            scenario=request.get("scenario", ""),
            time_horizon=request.get("timeHorizon", [2024, 2050]),
            base_handler=self.base_handler,
            hazard_handler=self.hazard_handler,
        )

    def _clear(self):
        """
        Clear previously generated maps and GeoJSON datasets from the temporary directory.

        This method calls the clear_temp_dir function to delete all files in the temporary
        directory.

        :return: None
        """
        self.base_handler.clear_temp_dir()

    def _get_era_discount_rate(self) -> DiscRates:
        """
        Get the ERA project discount rate from the country config.

        Reads the country's ``discount_rate`` from ``countries/<ISO3>/config.json``
        and builds a CLIMADA ``DiscRates`` covering the requested time horizon.

        :return: The ERA discount rates, or ``None`` on failure (the failure is
            recorded on ``self.status``).
        :rtype: DiscRates
        """
        try:
            config = load_country_config(self.request_data.country_code)
            year_range = np.arange(self.request_data.ref_year, self.request_data.future_year + 1)
            n_years = self.request_data.future_year - self.request_data.ref_year + 1
            annual_discount = np.ones(n_years) * config.discount_rate
            discount_rates = DiscRates(year_range, annual_discount)
            discount_rates.check()
            return discount_rates

        except Exception as exception:
            status_code = 3000
            status_message = (
                f"An error occurred while getting ERA discount rate. More info: {exception}"
            )
            self.status.set_error(status_code, status_message)
            self.logger.log("error", status_message)
            return None

    def _get_average_annual_growth(self) -> float:
        """
        Get the average annual growth rate based on the request parameters.

        For ERA runs, the rate is read from the country config keyed by the
        current ``exposure_type`` (returns 0.0 for unmapped sectors). For
        custom runs, the user-supplied ``annual_growth`` is used.

        :return: The average annual growth rate.
        :rtype: float
        """
        if not self.request_data.is_era:
            return self.request_data.annual_growth

        try:
            config = load_country_config(self.request_data.country_code)
        except CountryConfigError as exc:
            self.logger.log(
                "error",
                f"Country config unavailable for {self.request_data.country_code}; "
                f"defaulting growth rate to 0. More info: {exc}",
            )
            return 0.0
        return config.annual_growth_rate.get(self.request_data.exposure_type, 0.0)

    def _resolve_return_periods(self) -> tuple:
        """
        Resolve hazard return periods from the country config.

        Falls back to the generic hazard-handler defaults when no country
        config exists or the hazard code is not enumerated for that country.
        """
        hazard_code = self.request_data.hazard_code
        default = self.hazard_handler.get_custom_rp_per_hazard(hazard_code)
        try:
            config = load_country_config(self.request_data.country_code)
        except CountryConfigError:
            return default
        return config.return_periods.get(hazard_code, default)

    def _resolve_hazard_intensity_unit(self, entity) -> str:
        """
        Look up the impact-function intensity unit for an entity, returning
        an empty string when no entity is loaded.

        The empty-string default matches ``HazardHandler.get_hazard_intensity_
        units_from_entity``'s own ``impf.intensity_unit or ""`` fallback, so
        downstream ``hazard.units = ...`` assignments behave identically on
        both branches.
        """
        if entity is None:
            return ""
        return self.hazard_handler.get_hazard_intensity_units_from_entity(entity)

    def _run_era_scenario(self):
        """
        Run the ERA scenario based on the provided request parameters.

        This method orchestrates the execution of the ERA scenario based on the provided
        parameters. It involves setting up Entity, Exposure, and Hazard objects,
        conducting cost-benefit analysis, plotting cost-benefit charts and waterfall graphs,
        calculating present and future impacts, and generating geojson data files for
        exposure, hazard, and impact maps.

        :raises Exception: If an error occurs while running the ERA scenario.
        """
        try:
            # Get ERA entity data
            self.base_handler.update_progress(
                10, "Setting up Entity objects from predefined entity file..."
            )
            entity_filename = self.entity_handler.get_entity_filename(
                self.request_data.country_code,
                self.request_data.hazard_code,
                self.request_data.exposure_type,
            )
            entity_present = self.entity_handler.get_entity_from_xlsx(entity_filename)

            hazard_intensity_unit = self._resolve_hazard_intensity_unit(entity_present)

            # Resolve scenario return periods per hazard from the country config
            return_periods = self._resolve_return_periods()

            # Set static present year to 2024
            entity_present.exposures.ref_year = self.request_data.ref_year

            # Get predefined average annual economic/population growth
            aag = self._get_average_annual_growth()

            entity_future = None
            if self.request_data.scenario != "historical":
                entity_future = self.entity_handler.get_future_entity(
                    entity_present, self.request_data.future_year, aag
                )
                if entity_present.disc_rates:
                    entity_future.disc_rates = entity_present.disc_rates

            # Set Exposure objects
            self.base_handler.update_progress(
                20, "Setting up Exposure objects from predefined datasets..."
            )
            exposure_present = entity_present.exposures
            exposure_future = None
            if self.request_data.scenario != "historical":
                exposure_future = entity_future.exposures

            # Get ERA hazard data
            self.base_handler.update_progress(
                30, "Setting up Hazard objects from predefined datasets..."
            )
            hazard_present_filename = self.hazard_handler.get_hazard_filename(
                self.request_data.hazard_code,
                self.request_data.country_code,
                "historical",
            )
            hazard_present = self.hazard_handler.get_hazard(
                hazard_type=self.request_data.hazard_type, filepath=hazard_present_filename
            )
            hazard_present.units = hazard_intensity_unit

            hazard_future = None
            if self.request_data.scenario != "historical":
                hazard_future_filename = self.hazard_handler.get_hazard_filename(
                    self.request_data.hazard_code,
                    self.request_data.country_code,
                    self.request_data.scenario,
                )
                hazard_future = self.hazard_handler.get_hazard(
                    hazard_type=self.request_data.hazard_type, filepath=hazard_future_filename
                )
                hazard_future.units = hazard_intensity_unit

            # Conduct cost-benefit analysis
            self.base_handler.update_progress(
                40, "Conducting cost-benefit analysis based on predefined datasets..."
            )
            cost_benefit = self.costben_handler.calculate_cost_benefit(
                hazard_present,
                entity_present,
                hazard_future,
                entity_future,
                self.request_data.future_year,
            )

            # Plot cost-benefit charts
            self.base_handler.update_progress(50, "Plotting cost-benefit graph...")
            self.costben_handler.plot_cost_benefit(cost_benefit, self.request_data.asset_type)
            if self.request_data.scenario != "historical":
                self.base_handler.update_progress(
                    55, "Plotting waterfall graph with given risk metric..."
                )
                self.costben_handler.plot_waterfall(
                    cost_benefit, hazard_present, entity_present, hazard_future, entity_future
                )

            # Calculate present and future impact
            self.base_handler.update_progress(
                60, "Setting up Impact objects from predefined datasets..."
            )
            impact_present = self.impact_handler.calculate_impact(
                exposure_present, hazard_present, entity_present.impact_funcs
            )
            impact_future = None
            if self.request_data.scenario != "historical":
                impact_future = self.impact_handler.calculate_impact(
                    exposure_future, hazard_future, entity_future.impact_funcs
                )

            # Generate geojson data files
            self.base_handler.update_progress(70, "Generating Exposure map data files...")
            if self.request_data.scenario == "historical":
                self.exposure_handler.generate_exposure_geojson(
                    exposure_present, self.request_data.country_name
                )
            else:
                self.exposure_handler.generate_exposure_geojson(
                    exposure_future, self.request_data.country_name
                )

            self.base_handler.update_progress(75, "Generating Hazard map data files...")
            if self.request_data.scenario == "historical":
                self.hazard_handler.generate_hazard_geojson(
                    hazard_present,
                    self.request_data.country_name,
                    return_periods,
                )
            else:
                self.hazard_handler.generate_hazard_geojson(
                    hazard_future,
                    self.request_data.country_name,
                    return_periods,
                )

            # Calculate impact geojson data files
            self.base_handler.update_progress(80, "Generating Impact map data files...")
            if self.request_data.scenario == "historical":
                self.impact_handler.generate_impact_geojson(
                    impact_present,
                    self.request_data.country_name,
                    return_periods,
                    self.request_data.asset_type,
                    self.request_data.exposure_type,
                )
            else:
                self.impact_handler.generate_impact_geojson(
                    impact_future,
                    self.request_data.country_name,
                    return_periods,
                    self.request_data.asset_type,
                    self.request_data.exposure_type,
                )

            # Save exporure data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(85, "Generating Exposure report data files...")
            exp_rep_df = self.exposure_handler.generate_exposure_report_dataset(
                exposure_present if self.request_data.scenario == "historical" else exposure_future,
                self.request_data.country_name,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                exp_rep_df, DATA_TEMP_DIR / "exposure_report_data.parquet"
            )

            # Save hazard data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(90, "Generating Hazard report data files...")
            haz_rep_df = self.hazard_handler.generate_hazard_report_dataset(
                hazard_present if self.request_data.scenario == "historical" else hazard_future,
                self.request_data.country_name,
                return_periods,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                haz_rep_df, DATA_TEMP_DIR / "hazard_report_data.parquet"
            )

            # Save impact data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(95, "Generating Impact report data files...")
            imp_rep_df = self.impact_handler.generate_impact_report_dataset(
                impact_present if self.request_data.scenario == "historical" else impact_future,
                self.request_data.country_name,
                return_periods,
                self.request_data.asset_type,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                imp_rep_df, DATA_TEMP_DIR / "impact_report_data.parquet"
            )

            self.base_handler.update_progress(100, "Scenario run successfully.")

        except Exception as exception:
            status_code = 3000
            status_message = f"An error occurred while running ERA scenario. More info: {exception}"
            self.status.set_error(status_code, status_message)
            self.logger.log("error", status_message)

    def _run_custom_scenario(self):
        """
        Run a custom scenario based on the provided request parameters.

        This method orchestrates the execution of a custom scenario based on the provided
        parameters. It involves setting up Entity, Exposure, and Hazard objects, conducting
        cost-benefit analysis, plotting cost-benefit charts and waterfall graphs, calculating
        present and future impacts, and generating geojson data files for exposure, hazard,
        and impact maps.

        :raises Exception: If an error occurs while running the custom scenario.
        """
        try:
            # Get custom entity data
            self.base_handler.update_progress(
                10, "Setting up Entity objects from custom datasets..."
            )
            # Case 1: User provides a custom excel entity dataset
            if self.request_data.entity_filename:
                entity_present = self.entity_handler.get_entity_from_xlsx(
                    self.request_data.entity_filename
                )
                exposure_present = entity_present.exposures
            # Case 2: User fetches exposure datasets from the CLIMADA API
            else:
                entity_present = None
                exposure_present = self.exposure_handler.get_exposure_from_api(
                    self.request_data.country_name
                )

            hazard_intensity_unit = self._resolve_hazard_intensity_unit(entity_present)

            # Resolve scenario return periods per hazard from the country config
            return_periods = self._resolve_return_periods()

            # Set present year for custom scenario from user time horizon selection
            exposure_present.ref_year = self.request_data.ref_year

            # Get custom average annual economic/population growth from user
            # annual growth selection
            aag = self._get_average_annual_growth()

            entity_future = None
            if self.request_data.scenario != "historical":
                # Get future Entity object based on the future year from user
                # time horizon selection
                entity_future = self.entity_handler.get_future_entity(
                    entity_present, self.request_data.future_year, aag
                )
                if entity_present.disc_rates:
                    entity_future.disc_rates = entity_present.disc_rates

            # Set Exposure objects
            self.base_handler.update_progress(
                20, "Setting up Exposure objects from custom datasets..."
            )
            exposure_present = entity_present.exposures
            exposure_future = None
            if self.request_data.scenario != "historical":
                exposure_future = entity_future.exposures

            # Get ERA hazard data
            self.base_handler.update_progress(
                30, "Setting up Hazard objects from custom datasets..."
            )

            # Case 1: User loads hazard dataset
            if self.request_data.hazard_filename:
                file_type = self.base_handler.check_file_type(self.request_data.hazard_filename)
                # If this is a historical climate scenario run, create a Hazard object using
                # the provided hazard dataset.
                if self.request_data.scenario == "historical":
                    hazard_present = self.hazard_handler.get_hazard(
                        hazard_type=self.request_data.hazard_type,
                        filepath=self.request_data.hazard_filename,
                        source=file_type,
                    )
                    hazard_present.units = hazard_intensity_unit
                # If this is a future based climate scenario run, create a historical Hazard
                # object using the ERA project historical climate scenario dataset and then
                # create a future based climate scenario Hazard object using the provided
                # hazard dataset.
                else:
                    hazard_present_filename = self.hazard_handler.get_hazard_filename(
                        self.request_data.hazard_code,
                        self.request_data.country_code,
                        "historical",
                    )
                    hazard_present = self.hazard_handler.get_hazard(
                        hazard_type=self.request_data.hazard_type, filepath=hazard_present_filename
                    )
                    hazard_present.units = hazard_intensity_unit

            # Case 2: User fetches hazard datasets from the CLIMADA API
            else:
                hazard_present = self.hazard_handler.get_hazard(
                    hazard_type=self.request_data.hazard_type,
                    source="climada_api",
                    scenario=self.request_data.scenario,
                    # TODO: This won't work with CLIMADA's predefind ref years
                    time_horizon=self.request_data.time_horizon,
                    country=self.request_data.country_name,
                )

            hazard_future = None
            if self.request_data.scenario != "historical":
                # Case 1: User loads hazard dataset
                if self.request_data.hazard_filename:
                    file_type = self.base_handler.check_file_type(self.request_data.hazard_filename)
                    hazard_future = self.hazard_handler.get_hazard(
                        hazard_type=self.request_data.hazard_type,
                        filepath=self.request_data.hazard_filename,
                        source=file_type,
                    )
                    hazard_future.units = hazard_intensity_unit
                # Case 2: User fetches hazard datasets from the CLIMADA API
                else:
                    hazard_future = self.hazard_handler.get_hazard(
                        hazard_type=self.request_data.hazard_type,
                        source="climada_api",
                        scenario=self.request_data.scenario,
                        # TODO: This won't work with CLIMADA's predefind ref years
                        time_horizon=self.request_data.time_horizon,
                        country=self.request_data.country_name,
                    )

            # Conduct cost-benefit analysis
            self.base_handler.update_progress(
                40, "Conducting cost-benefit analysis based on custom datasets..."
            )
            cost_benefit = self.costben_handler.calculate_cost_benefit(
                hazard_present,
                entity_present,
                hazard_future,
                entity_future,
                self.request_data.future_year,
            )

            # Plot cost-benefit charts
            self.base_handler.update_progress(50, "Plotting cost-benefit graph...")
            self.costben_handler.plot_cost_benefit(cost_benefit, self.request_data.asset_type)
            if self.request_data.scenario != "historical":
                self.base_handler.update_progress(
                    55, "Plotting waterfall graph with given risk metric..."
                )
                self.costben_handler.plot_waterfall(
                    cost_benefit, hazard_present, entity_present, hazard_future, entity_future
                )

            # Calculate present and future impact
            self.base_handler.update_progress(
                60, "Setting up Impact objects from custom datasets..."
            )
            impact_present = self.impact_handler.calculate_impact(
                exposure_present, hazard_present, entity_present.impact_funcs
            )
            impact_future = None
            if self.request_data.scenario != "historical":
                impact_future = self.impact_handler.calculate_impact(
                    exposure_future, hazard_future, entity_future.impact_funcs
                )

            # Generate geojson data files
            self.base_handler.update_progress(70, "Generating Exposure map data files...")
            if self.request_data.scenario == "historical":
                self.exposure_handler.generate_exposure_geojson(
                    exposure_present, self.request_data.country_name
                )
            else:
                self.exposure_handler.generate_exposure_geojson(
                    exposure_future, self.request_data.country_name
                )

            self.base_handler.update_progress(75, "Generating Hazard map data files...")
            if self.request_data.scenario == "historical":
                self.hazard_handler.generate_hazard_geojson(
                    hazard_present,
                    self.request_data.country_name,
                    return_periods,
                )
            else:
                self.hazard_handler.generate_hazard_geojson(
                    hazard_future,
                    self.request_data.country_name,
                    return_periods,
                )

            # Calculate impact geojson data files
            self.base_handler.update_progress(80, "Generating Impact map data files...")
            if self.request_data.scenario == "historical":
                self.impact_handler.generate_impact_geojson(
                    impact_present,
                    self.request_data.country_name,
                    return_periods,
                    self.request_data.asset_type,
                    self.request_data.exposure_type,
                )
            else:
                self.impact_handler.generate_impact_geojson(
                    impact_future,
                    self.request_data.country_name,
                    return_periods,
                    self.request_data.asset_type,
                    self.request_data.exposure_type,
                )

            # Save exporure data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(85, "Generating Exposure report data files...")
            exp_rep_df = self.exposure_handler.generate_exposure_report_dataset(
                exposure_present if self.request_data.scenario == "historical" else exposure_future,
                self.request_data.country_name,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                exp_rep_df, DATA_TEMP_DIR / "exposure_report_data.parquet"
            )

            # Save hazard data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(90, "Generating Hazard report data files...")
            haz_rep_df = self.hazard_handler.generate_hazard_report_dataset(
                hazard_present if self.request_data.scenario == "historical" else hazard_future,
                self.request_data.country_name,
                return_periods,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                haz_rep_df, DATA_TEMP_DIR / "hazard_report_data.parquet"
            )

            # Save impact data to parquet files in TEMP directory to be used in report generation
            self.base_handler.update_progress(95, "Generating Impact report data files...")
            imp_rep_df = self.impact_handler.generate_impact_report_dataset(
                impact_present if self.request_data.scenario == "historical" else impact_future,
                self.request_data.country_name,
                return_periods,
                self.request_data.asset_type,
            )
            # Save the generated DataFrame as a Parquet file
            self.base_handler.save_parquet_file(
                imp_rep_df, DATA_TEMP_DIR / "impact_report_data.parquet"
            )

            self.base_handler.update_progress(100, "Scenario run successfully.")

        except Exception as exception:
            status_code = 3000
            status_message = (
                f"An error occurred while running custom scenario. More info: {exception}"
            )
            self.status.set_error(status_code, status_message)
            self.logger.log("error", status_message)

    def run_scenario(self) -> dict:
        """
        Run the scenario based on the provided request parameters.

        This method orchestrates the execution of a scenario based on the provided parameters.
        It determines whether to run an ERA scenario or a custom scenario and delegates the
        execution accordingly. After running the scenario, it sets the map title and prepares
        the response data.

        :return: A dictionary containing the scenario data and status information.
        :rtype: dict
        """
        initial_time = time()
        self.logger.log(
            "info",
            f"Running new {'ERA' if self.request_data.is_era else 'custom'} scenario for "
            f"{self.request_data.hazard_type} hazard affecting "
            f"{self.request_data.exposure_type} in "
            f"{self.request_data.country_name} for a {self.request_data.scenario}.",
        )

        if self.request_data.is_era:
            self._run_era_scenario()
        else:
            self._run_custom_scenario()

        # Generate map title
        map_title = self.base_handler.set_map_title(
            self.request_data.hazard_type,
            self.request_data.country_name,
            self.request_data.future_year,
            self.request_data.scenario,
        )

        # Create metadata file
        metadata = {
            "asset_type": self.request_data.asset_type.lower(),
            "annual_growth": self.request_data.annual_growth,
            "country_name": self.request_data.country_name.lower(),
            "exposure_economic": self.request_data.exposure_economic.lower(),
            "exposure_non_economic": self.request_data.exposure_non_economic.lower(),
            "hazard_type": self.request_data.hazard_type.lower(),
            "is_era": self.request_data.is_era,
            "scenario": self.request_data.scenario.lower(),
            "ref_year": self.request_data.ref_year,
            "future_year": self.request_data.future_year,
            "app_option": "era" if self.request_data.is_era else "explore",
        }
        self.base_handler.create_results_metadata_file(metadata)

        response = {
            "data": {"mapTitle": map_title},
            "status": self.status.get_status(),
        }
        self.logger.log("info", f"Finished running scenario in {time() - initial_time}sec.")
        return response


if __name__ == "__main__":
    req = json.loads(sys.argv[1])
    runner = RunScenario(req)
    resp = runner.run_scenario()
    print(json.dumps(resp))
