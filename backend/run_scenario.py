"""
Module to handle running scenarios based on provided parameters.

This module exposes a single ``run_scenario()`` entry point that orchestrates
a scenario end-to-end: data loading (via a :class:`ScenarioDataStrategy`),
cost-benefit analysis, impact calculation, and generation of the map-data
artifacts the frontend consumes.

Classes:

- :class:`RequestData`: plain dataclass holding the scenario request
  parameters after they are sanitized by the runner. No service handlers
  are stored on the dataclass; it is cheap to construct in tests.
- :class:`RunScenario`: orchestrates the run by delegating data loading
  to the selected strategy and running the common compute pipeline.
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
from scenario_strategy import ScenarioDataStrategy, make_strategy


@dataclass
class RequestData:
    """Plain data container for a scenario request.

    All fields are either primitive values taken directly from the UI
    payload or derived via :py:meth:`__post_init__` from those primitives.
    The dataclass deliberately holds no service handlers; the scenario
    runner owns them and passes ``RequestData`` in as an argument.
    """

    adaptation_measures: list[str]
    annual_growth: float
    country_name: str
    country_code: str
    entity_filename: str
    exposure_economic: str
    exposure_non_economic: str
    hazard_filename: str
    hazard_type: str
    hazard_code: str
    is_era: bool
    scenario: str
    time_horizon: tuple[int, int]
    asset_type: str = field(init=False)
    exposure_type: str = field(init=False)
    ref_year: int = field(init=False)
    future_year: int = field(init=False)

    def __post_init__(self):
        self.exposure_type = self.exposure_economic or self.exposure_non_economic
        self.ref_year = self.time_horizon[0]
        self.future_year = self.time_horizon[1]
        self.asset_type = "economic" if self.exposure_economic else "non_economic"

    @classmethod
    def from_request(
        cls,
        request: dict,
        base_handler: BaseHandler,
        hazard_handler: HazardHandler,
    ) -> "RequestData":
        """Build a ``RequestData`` from the raw UI payload plus the handlers
        needed to sanitize country/hazard fields."""
        country_name = base_handler.sanitize_country_name(request.get("countryName", ""))
        return cls(
            adaptation_measures=request.get("adaptationMeasures", []),
            annual_growth=request.get("annualGrowth", 0),
            country_name=country_name,
            country_code=base_handler.get_iso3_country_code(country_name),
            entity_filename=request.get("exposureFile", ""),
            exposure_economic=request.get("exposureEconomic", ""),
            exposure_non_economic=request.get("exposureNonEconomic", ""),
            hazard_filename=request.get("hazardFile", ""),
            hazard_type=request.get("hazardType", ""),
            hazard_code=hazard_handler.get_hazard_code(request.get("hazardType", "")),
            is_era=request.get("isEra", False),
            scenario=request.get("scenario", ""),
            time_horizon=request.get("timeHorizon", [2024, 2050]),
        )


class Status:
    """Helper class to handle status codes and messages."""

    def __init__(self):
        self.code = 2000
        self.message = "Scenario run successfully."

    def set_error(self, code: int, message: str):
        self.code = code
        self.message = message

    def get_status(self) -> dict:
        return {"code": self.code, "message": self.message}


class RunScenario:
    """Orchestrate the execution of a scenario from request to response."""

    def __init__(self, request):
        self._initialize_handlers()
        self.base_handler.initalize_data_directories()
        self._clear()
        self.logger = LoggerConfig(logger_types=["file"])
        self.request_data = RequestData.from_request(
            request, self.base_handler, self.hazard_handler
        )
        self.status = Status()
        self._clear()

    def _initialize_handlers(self):
        self.base_handler = BaseHandler()
        self.costben_handler = CostBenefitHandler()
        self.entity_handler = EntityHandler()
        self.exposure_handler = ExposureHandler()
        self.hazard_handler = HazardHandler()
        self.impact_handler = ImpactHandler()

    def _clear(self):
        self.base_handler.clear_temp_dir()

    def _get_era_discount_rate(self) -> DiscRates:
        """Build the ERA discount rate from the country config.

        Reads the country's ``discount_rate`` from ``countries/<ISO3>/config.json``
        and returns a CLIMADA ``DiscRates`` over the requested time horizon,
        or ``None`` on failure (recording the failure on ``self.status``).
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
        """Return the ERA per-exposure growth rate or the user-supplied rate.

        For ERA runs, the rate is read from the country config keyed by the
        current ``exposure_type`` (returns 0.0 for unmapped sectors). For
        custom runs, the user-supplied ``annual_growth`` is used.
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
        """Return-period lookup with fallback to hazard-handler defaults."""
        hazard_code = self.request_data.hazard_code
        default = self.hazard_handler.get_custom_rp_per_hazard(hazard_code)
        try:
            config = load_country_config(self.request_data.country_code)
        except CountryConfigError:
            return default
        return config.return_periods.get(hazard_code, default)

    def _resolve_hazard_intensity_unit(self, entity: Any) -> str:
        """Look up the impact-function intensity unit for an entity.

        Returns an empty string when no entity is loaded, matching
        ``HazardHandler.get_hazard_intensity_units_from_entity``'s own
        ``impf.intensity_unit or ""`` fallback so downstream
        ``hazard.units = ...`` assignments behave identically on both
        branches.
        """
        if entity is None:
            return ""
        return self.hazard_handler.get_hazard_intensity_units_from_entity(entity)

    def _execute(self, strategy: ScenarioDataStrategy) -> None:
        """Run the compute pipeline for the selected strategy.

        Step order (and the progress-bar percentages) matches the pre-refactor
        ERA / custom implementations exactly so numerical outputs are
        unchanged. The only per-mode divergence is the data-loading lines,
        which are delegated to ``strategy``.
        """
        is_future = self.request_data.scenario != "historical"

        # --- Entity (present + future) ---
        self.base_handler.update_progress(10, strategy.entity_progress_message)
        entity_present, exposure_present = strategy.load_entity_and_exposure(
            self.request_data, self.entity_handler, self.exposure_handler
        )

        hazard_intensity_unit = self._resolve_hazard_intensity_unit(entity_present)
        return_periods = self._resolve_return_periods()

        exposure_present.ref_year = self.request_data.ref_year

        aag = self._get_average_annual_growth()

        entity_future = None
        if is_future:
            entity_future = self.entity_handler.get_future_entity(
                entity_present, self.request_data.future_year, aag
            )
            if entity_present.disc_rates:
                entity_future.disc_rates = entity_present.disc_rates

        # --- Exposure ---
        self.base_handler.update_progress(20, strategy.exposure_progress_message)
        exposure_present = entity_present.exposures
        exposure_future = entity_future.exposures if is_future else None

        # --- Hazard ---
        self.base_handler.update_progress(30, strategy.hazard_progress_message)
        hazard_present = strategy.load_hazard_present(
            self.request_data,
            self.hazard_handler,
            self.base_handler,
            hazard_intensity_unit,
        )
        hazard_future = None
        if is_future:
            hazard_future = strategy.load_hazard_future(
                self.request_data,
                self.hazard_handler,
                self.base_handler,
                hazard_intensity_unit,
            )

        # --- Cost-benefit ---
        self.base_handler.update_progress(40, strategy.cost_benefit_progress_message)
        cost_benefit = self.costben_handler.calculate_cost_benefit(
            hazard_present,
            entity_present,
            hazard_future,
            entity_future,
            self.request_data.future_year,
        )

        self.base_handler.update_progress(50, "Plotting cost-benefit graph...")
        self.costben_handler.plot_cost_benefit(cost_benefit, self.request_data.asset_type)
        if is_future:
            self.base_handler.update_progress(
                55, "Computing waterfall chart data..."
            )
            self.costben_handler.compute_waterfall_data(
                cost_benefit, hazard_present, entity_present, hazard_future, entity_future
            )

        # --- Impact ---
        self.base_handler.update_progress(60, strategy.impact_progress_message)
        impact_present = self.impact_handler.calculate_impact(
            exposure_present, hazard_present, entity_present.impact_funcs
        )
        impact_future = None
        if is_future:
            impact_future = self.impact_handler.calculate_impact(
                exposure_future, hazard_future, entity_future.impact_funcs
            )

        # Downstream artifacts use the future-scenario objects when available,
        # falling back to the present-day objects for historical runs.
        exposure_active = exposure_future if is_future else exposure_present
        hazard_active = hazard_future if is_future else hazard_present
        impact_active = impact_future if is_future else impact_present

        # --- GeoJSONs ---
        self.base_handler.update_progress(70, "Generating Exposure map data files...")
        self.exposure_handler.generate_exposure_geojson(
            exposure_active,
            self.request_data.country_name,
        )

        self.base_handler.update_progress(75, "Generating Hazard map data files...")
        self.hazard_handler.generate_hazard_geojson(
            hazard_active,
            self.request_data.country_name,
            return_periods,
        )

        self.base_handler.update_progress(80, "Generating Impact map data files...")
        self.impact_handler.generate_impact_geojson(
            impact_active,
            self.request_data.country_name,
            return_periods,
            self.request_data.asset_type,
            self.request_data.exposure_type,
        )

        # --- Parquet report data ---
        self.base_handler.update_progress(85, "Generating Exposure report data files...")
        exp_rep_df = self.exposure_handler.generate_exposure_report_dataset(
            exposure_active,
            self.request_data.country_name,
        )
        self.base_handler.save_parquet_file(
            exp_rep_df, DATA_TEMP_DIR / "exposure_report_data.parquet"
        )

        self.base_handler.update_progress(90, "Generating Hazard report data files...")
        haz_rep_df = self.hazard_handler.generate_hazard_report_dataset(
            hazard_active,
            self.request_data.country_name,
            return_periods,
        )
        self.base_handler.save_parquet_file(
            haz_rep_df, DATA_TEMP_DIR / "hazard_report_data.parquet"
        )

        self.base_handler.update_progress(95, "Generating Impact report data files...")
        imp_rep_df = self.impact_handler.generate_impact_report_dataset(
            impact_active,
            self.request_data.country_name,
            return_periods,
            self.request_data.asset_type,
        )
        self.base_handler.save_parquet_file(
            imp_rep_df, DATA_TEMP_DIR / "impact_report_data.parquet"
        )

        self.base_handler.update_progress(100, "Scenario run successfully.")

    def run_scenario(self) -> dict:
        """Entry point: run the scenario and return a response dict.

        The ERA vs custom split is a single-line decision now — pick the
        strategy and hand it to :py:meth:`_execute`. Everything downstream
        is shared.
        """
        initial_time = time()
        self.logger.log(
            "info",
            f"Running new {'ERA' if self.request_data.is_era else 'custom'} scenario for "
            f"{self.request_data.hazard_type} hazard affecting "
            f"{self.request_data.exposure_type} in "
            f"{self.request_data.country_name} for a {self.request_data.scenario}.",
        )

        strategy = make_strategy(self.request_data.is_era)
        try:
            self._execute(strategy)
        except Exception as exception:
            mode = "ERA" if self.request_data.is_era else "custom"
            status_code = 3000
            status_message = (
                f"An error occurred while running {mode} scenario. More info: {exception}"
            )
            self.status.set_error(status_code, status_message)
            self.logger.log("error", status_message)

        map_title = self.base_handler.set_map_title(
            self.request_data.hazard_type,
            self.request_data.country_name,
            self.request_data.future_year,
            self.request_data.scenario,
        )

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
