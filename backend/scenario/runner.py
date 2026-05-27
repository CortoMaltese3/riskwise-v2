"""Scenario runner: orchestrate a scenario end-to-end.

The runner exposes :py:meth:`RunScenario.run_scenario` as the single entry
point. It delegates data loading to a :class:`ScenarioDataStrategy`,
caching to :class:`RunCache`, GeoJSON generation to
:class:`GeoJsonGenerator`, and DB persistence to :class:`RunPersister`.
The shared compute pipeline lives in :py:meth:`RunScenario._execute`.
"""

import json
import sys
from time import time
from typing import Any

import numpy as np

from backend.cli import StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.costben.costben_handler import CostBenefitHandler
from backend.countries.loader import CountryConfigError, load_country_config
from backend.entity.entity_handler import EntityHandler
from backend.exposure.exposure_handler import ExposureHandler
from backend.hazard.hazard_handler import HazardHandler
from backend.impact.impact_handler import ImpactHandler
from backend.impact.overrides import apply_impact_function_override
from backend.logging_config import get_logger
from backend.progress import update_progress
from backend.provenance import new_random_seed
from backend.scenario.cache import RunCache
from backend.scenario.geojson import GeoJsonGenerator
from backend.scenario.persistence import RunPersister
from backend.scenario.request import RequestData, _filter_entity_measures
from backend.scenario.strategy import ScenarioDataStrategy, make_strategy
from backend.utils.fs import clear_temp_dir, initalize_data_directories
from backend.utils.io import save_parquet_file
from backend.utils.metadata import create_results_metadata_file
from backend.utils.strings import set_map_title


class Status:
    """Helper class to handle status codes and messages."""

    def __init__(self):
        self.code = StatusCode.SUCCESS
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
        initalize_data_directories()
        clear_temp_dir()
        self.logger = get_logger("backend.scenario.runner")
        self.request_data = RequestData.from_request(request, self.hazard_handler)
        self.status = Status()
        # Seed once per run and hand the derived RNG to any stochastic step.
        # Storing the seed on ``self`` lets the persister stamp it onto the
        # scenario row so the run is reproducible from the DB alone.
        self.random_seed: int = new_random_seed()
        self.rng: np.random.Generator = np.random.default_rng(self.random_seed)
        # Names of selected measures dropped by ``_filter_entity_measures``
        # across the present + future passes — surfaced to the renderer in
        # the run response so the UI can warn the user that some of their
        # picks did not apply to this scenario (issue #450).
        self.skipped_measures: list[str] = []
        self._cache = RunCache(self.logger)
        self._persister = RunPersister(self.logger, self.request_data, self.random_seed)
        self._geojson = GeoJsonGenerator(
            self.logger,
            self.exposure_handler,
            self.hazard_handler,
            self.impact_handler,
            self.request_data,
        )

    def _initialize_handlers(self):
        self.costben_handler = CostBenefitHandler()
        self.entity_handler = EntityHandler()
        self.exposure_handler = ExposureHandler()
        self.hazard_handler = HazardHandler()
        self.impact_handler = ImpactHandler()

    def _get_era_discount_rate(self) -> float | None:
        """Read the ERA discount rate from the country config.

        Returns the country's ``discount_rate`` (a scalar) for the
        requested run, or ``None`` on failure (recording the failure on
        ``self.status``).
        """
        try:
            config = load_country_config(self.request_data.country_code)
            return float(config.discount_rate)
        except (CountryConfigError, AttributeError, TypeError, ValueError) as exception:
            status_code = StatusCode.VALIDATION_ERROR
            status_message = (
                f"An error occurred while getting ERA discount rate. More info: {exception}"
            )
            self.status.set_error(status_code, status_message)
            self.logger.error(status_message)
            return None

    def _get_average_annual_growth(self) -> float:
        """Return the ERA per-exposure growth rate or the user-supplied rate."""
        if not self.request_data.is_era:
            return self.request_data.annual_growth

        try:
            config = load_country_config(self.request_data.country_code)
        except CountryConfigError as exc:
            self.logger.error(
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
        empty-string fallback so the downstream
        ``HazardArrays.intensity_unit`` propagation is well-defined on
        both branches.
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
        update_progress(10, strategy.entity_progress_message)
        entity_present, exposure_present = strategy.load_entity_and_exposure(
            self.request_data, self.entity_handler, self.exposure_handler
        )

        hazard_intensity_unit = self._resolve_hazard_intensity_unit(entity_present)
        return_periods = self._resolve_return_periods()

        aag = self._get_average_annual_growth()

        # Apply the user's IF edit (#453) before the future entity is
        # derived so the projected entity inherits the modified curve.
        # ERA-mode runs reject the override at the endpoint layer, so the
        # branch is implicitly custom-only.
        if self.request_data.impact_function_override is not None:
            entity_present = apply_impact_function_override(
                entity_present,
                self.request_data.impact_function_override,
                self.logger,
            )

        entity_future = None
        if is_future:
            entity_future = self.entity_handler.get_future_entity(
                entity_present, self.request_data.future_year, aag
            )

        # CLIMADA requires the present and future entities to carry
        # identical measure sets, so any filter is applied to both. The
        # set of "selected but not on the entity" names is identical
        # across both passes (same selection, same entity-measure schema),
        # so the present-pass result is what we surface.
        entity_present, skipped = _filter_entity_measures(
            entity_present,
            self.request_data.selected_measure_ids,
            self.logger,
        )
        self.skipped_measures = skipped
        if entity_future is not None:
            entity_future, _ = _filter_entity_measures(
                entity_future,
                self.request_data.selected_measure_ids,
                self.logger,
            )

        # --- Exposure ---
        update_progress(20, strategy.exposure_progress_message)
        exposure_present = entity_present.exposures
        exposure_future = entity_future.exposures if is_future else None

        # --- Hazard ---
        update_progress(30, strategy.hazard_progress_message)
        hazard_present = strategy.load_hazard_present(
            self.request_data,
            self.hazard_handler,
            hazard_intensity_unit,
        )
        hazard_future = None
        if is_future:
            hazard_future = strategy.load_hazard_future(
                self.request_data,
                self.hazard_handler,
                hazard_intensity_unit,
            )

        # --- Cost-benefit ---
        update_progress(40, strategy.cost_benefit_progress_message)
        cost_benefit = self.costben_handler.calculate_cost_benefit(
            hazard_present,
            entity_present,
            hazard_future,
            self.request_data.future_year,
        )

        update_progress(50, "Computing cost-benefit chart data...")
        # Always write the cost-benefit payload — even for zero-measure runs
        # the engine returns ``[]`` and ``compute_cost_benefit_data`` writes a
        # ``measures: []`` payload. This lets the renderer show the proper
        # ``adaptation_empty_state_no_measures`` copy instead of the backend's
        # generic "data not available" error (issue #428), and protects the
        # restore-then-rerun race where a re-run dispatched with no measures
        # would otherwise leave the previously-hydrated file in place after
        # ``_clear`` wipes it.
        # Engine ``measure_name`` arrives as an opaque short code ("GR",
        # "TP", ...); ask the handler to join it back to the catalog's i18n
        # key so the chart can render translated full names (#429).
        display_name_lookup = self.costben_handler.build_display_name_lookup()
        self.costben_handler.compute_cost_benefit_data(
            cost_benefit,
            entity_present,
            self.request_data.future_year,
            entity_future,
            display_name_lookup=display_name_lookup,
        )
        if is_future:
            update_progress(55, "Computing waterfall chart data...")
            self.costben_handler.compute_waterfall_data(
                cost_benefit, hazard_present, entity_present, hazard_future, entity_future
            )

        # --- Impact ---
        update_progress(60, strategy.impact_progress_message)
        impact_present = self.impact_handler.calculate_impact(
            exposure_present, hazard_present, entity_present.impfset_specs
        )
        impact_future = None
        if is_future:
            impact_future = self.impact_handler.calculate_impact(
                exposure_future, hazard_future, entity_future.impfset_specs
            )

        # Downstream artifacts use the future-scenario objects when available,
        # falling back to the present-day objects for historical runs.
        exposure_active = exposure_future if is_future else exposure_present
        hazard_active = hazard_future if is_future else hazard_present
        impact_active = impact_future if is_future else impact_present

        # --- GeoJSONs (concurrent; each emits an SSE partial event) ---
        update_progress(70, "Generating map data files...")
        self._geojson.generate(
            exposure_active,
            hazard_active,
            impact_active,
            return_periods,
        )

        # --- Parquet report data ---
        update_progress(85, "Generating Exposure report data files...")
        exp_rep_df = self.exposure_handler.generate_exposure_report_dataset(
            exposure_active,
            self.request_data.country_name,
        )
        save_parquet_file(exp_rep_df, DATA_TEMP_DIR / "exposure_report_data.parquet")

        update_progress(90, "Generating Hazard report data files...")
        haz_rep_df = self.hazard_handler.generate_hazard_report_dataset(
            hazard_active,
            self.request_data.country_name,
            return_periods,
        )
        save_parquet_file(haz_rep_df, DATA_TEMP_DIR / "hazard_report_data.parquet")

        update_progress(95, "Generating Impact report data files...")
        imp_rep_df = self.impact_handler.generate_impact_report_dataset(
            impact_active,
            exposure_active,
            self.request_data.country_name,
            return_periods,
            self.request_data.asset_type,
        )
        save_parquet_file(imp_rep_df, DATA_TEMP_DIR / "impact_report_data.parquet")

        update_progress(100, "Scenario run successfully.")

    def run_scenario(self) -> dict:
        """Entry point: run the scenario and return a response dict."""
        initial_time = time()
        self.logger.info(
            f"Running new {'ERA' if self.request_data.is_era else 'custom'} scenario for "
            f"{self.request_data.hazard_type} hazard affecting "
            f"{self.request_data.exposure_type} in "
            f"{self.request_data.country_name} for a {self.request_data.scenario}.",
        )

        strategy = make_strategy(self.request_data.is_era)
        cache_key = self._cache.derive_key(self.request_data)
        cache_hit = False
        if cache_key is not None:
            cache_hit = self._cache.restore(cache_key)
        try:
            if not cache_hit:
                self._execute(strategy)
        except Exception as exception:  # noqa: BLE001 - scenario boundary translation
            # ``_execute`` ultimately calls into CLIMADA / climate-lama-engine,
            # which raises arbitrary subclasses; we translate every failure
            # into an envelope on ``self.status`` rather than crashing the
            # in-process runner.
            mode = "ERA" if self.request_data.is_era else "custom"
            status_code = StatusCode.VALIDATION_ERROR
            status_message = (
                f"An error occurred while running {mode} scenario. More info: {exception}"
            )
            self.status.set_error(status_code, status_message)
            self.logger.error(status_message)

        map_title = set_map_title(
            self.request_data.hazard_type,
            self.request_data.country_name,
            self.request_data.future_year,
            self.request_data.scenario,
        )

        metadata = {
            "asset_type": self.request_data.asset_type.lower(),
            "annual_growth": self.request_data.annual_growth,
            "country_name": self.request_data.country_name.lower(),
            "exposure_type": self.request_data.exposure_type.lower(),
            "hazard_type": self.request_data.hazard_type.lower(),
            "is_era": self.request_data.is_era,
            "scenario": self.request_data.scenario.lower(),
            "ref_year": self.request_data.ref_year,
            "future_year": self.request_data.future_year,
            "app_option": "era" if self.request_data.is_era else "explore",
        }
        create_results_metadata_file(metadata)

        scenario_id: str | None = None
        if self.status.code == StatusCode.SUCCESS:
            scenario_id = self._persister.persist(map_title, metadata)
            if cache_key is not None and not cache_hit:
                self._cache.store(cache_key)

        response = {
            "data": {
                "mapTitle": map_title,
                "scenarioId": scenario_id,
                # Names of catalog measures the user selected but the
                # entity does not carry — the renderer uses this list to
                # raise a non-blocking snackbar and tag the cost-benefit
                # chart so the silent backend filter is no longer
                # invisible (issue #450).
                "skippedMeasures": list(self.skipped_measures),
            },
            "status": self.status.get_status(),
        }
        self.logger.info(f"Finished running scenario in {time() - initial_time}sec.")
        return response


if __name__ == "__main__":
    req = json.loads(sys.argv[1])
    runner = RunScenario(req)
    resp = runner.run_scenario()
    print(json.dumps(resp))
