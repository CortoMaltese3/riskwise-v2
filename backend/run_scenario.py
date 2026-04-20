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
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from time import time
from typing import Any

import numpy as np
from base_handler import BaseHandler
from climada.entity import DiscRates
from constants import DATA_TEMP_DIR
from costben.costben_handler import CostBenefitHandler
from countries.loader import CountryConfigError, load_country_config
from db import cache_store, insert_scenario, read_result_blobs
from entity.entity_handler import EntityHandler
from exposure.exposure_handler import ExposureHandler
from hazard.hazard_handler import HazardHandler
from impact.impact_handler import ImpactHandler
from logger_config import LoggerConfig
from provenance import REPRODUCIBILITY_NOTE, new_random_seed
from provenance import collect as collect_provenance
from scenario_strategy import ScenarioDataStrategy, make_strategy

_DATA_ENTITIES_DIR = Path(__file__).resolve().parent.parent / "data" / "entities"
_DATA_HAZARDS_DIR = Path(__file__).resolve().parent.parent / "data" / "hazards"
_COUNTRIES_DIR = Path(__file__).resolve().parent.parent / "countries"


def _resolve_country_config_path(country_code: str) -> Path:
    """Return the ``config.json`` path for ``country_code`` (built-in or custom).

    The extensibility registry owns the mapping from ISO3 → directory, so
    custom drop-ins under ``<user-data>/countries/<ISO3>`` return the
    user-data path here and the provenance SHA points at the same file
    the loader actually read. Unknown codes fall through to the built-in
    tree so the empty-path branch in provenance collection behaves exactly
    as before.
    """
    from extensibility.registry import get_registry as get_country_registry

    iso3 = country_code.upper()
    entry = get_country_registry().get(iso3)
    if entry is not None:
        return entry.config_path
    return _COUNTRIES_DIR / iso3 / "config.json"


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
        # Seed once per run and hand the derived RNG to any stochastic step.
        # Storing the seed on ``self`` lets ``_persist_to_db`` stamp it onto
        # the scenario row so the run is reproducible from the DB alone.
        self.random_seed: int = new_random_seed()
        self.rng: np.random.Generator = np.random.default_rng(self.random_seed)
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

        if is_future:
            self.base_handler.update_progress(50, "Computing cost-benefit chart data...")
            self.costben_handler.compute_cost_benefit_data(
                cost_benefit, entity_present, entity_future
            )
            self.base_handler.update_progress(55, "Computing waterfall chart data...")
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

        # --- GeoJSONs (generated concurrently; each emits an SSE partial
        # result event so the frontend can render layers as they finish
        # instead of waiting for all three). ---
        self.base_handler.update_progress(70, "Generating map data files...")
        self._generate_geojsons_parallel(
            exposure_active,
            hazard_active,
            impact_active,
            return_periods,
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

    # Map the SSE ``step`` name to the GeoJSON file each generator writes
    # into ``DATA_TEMP_DIR``. Ordering matches the acceptance criterion but
    # the *emission* order depends on which task finishes first.
    _GEOJSON_OUTPUTS = (
        ("exposure_ready", "exposures_geodata.json"),
        ("hazard_ready", "hazards_geodata.json"),
        ("impact_ready", "risks_geodata.json"),
    )

    def _generate_geojsons_parallel(
        self,
        exposure_active: Any,
        hazard_active: Any,
        impact_active: Any,
        return_periods: tuple,
    ) -> None:
        """Generate the three scenario GeoJSONs concurrently.

        Each task writes its output file through the existing handler (so
        the on-disk layout downstream code relies on is unchanged) and
        then, as it completes, the driver emits a ``progress`` SSE event
        carrying the parsed GeoJSON so the renderer can paint that layer
        before the other two finish. Thread names are logged to make the
        parallelism observable in traces.
        """
        from progress import progress_callback_var

        callback = progress_callback_var.get()
        country_name = self.request_data.country_name
        asset_type = self.request_data.asset_type
        exposure_type = self.request_data.exposure_type

        def _run_exposure() -> str:
            self.logger.log(
                "info",
                f"Generating exposure geojson on thread {threading.current_thread().name}",
            )
            self.exposure_handler.generate_exposure_geojson(exposure_active, country_name)
            return "exposure_ready"

        def _run_hazard() -> str:
            self.logger.log(
                "info",
                f"Generating hazard geojson on thread {threading.current_thread().name}",
            )
            self.hazard_handler.generate_hazard_geojson(hazard_active, country_name, return_periods)
            return "hazard_ready"

        def _run_impact() -> str:
            self.logger.log(
                "info",
                f"Generating impact geojson on thread {threading.current_thread().name}",
            )
            self.impact_handler.generate_impact_geojson(
                impact_active,
                country_name,
                return_periods,
                asset_type,
                exposure_type,
            )
            return "impact_ready"

        step_to_file = dict(self._GEOJSON_OUTPUTS)
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="geojson") as pool:
            futures = [
                pool.submit(_run_exposure),
                pool.submit(_run_hazard),
                pool.submit(_run_impact),
            ]
            for future in as_completed(futures):
                try:
                    step = future.result()
                except Exception as exc:
                    self.logger.log("error", f"GeoJSON generation task failed: {exc}")
                    continue
                if callback is None:
                    continue
                path = DATA_TEMP_DIR / step_to_file[step]
                try:
                    with open(path, encoding="utf-8") as fh:
                        data = json.load(fh)
                except (OSError, ValueError) as exc:
                    self.logger.log("warning", f"Failed to read {step} partial from {path}: {exc}")
                    continue
                callback({"type": "progress", "step": step, "data": data})

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
        cache_key = self._derive_computation_cache_key()
        cache_hit = False
        if cache_key is not None:
            cache_hit = self._restore_from_computation_cache(cache_key)
        try:
            if not cache_hit:
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

        scenario_id: str | None = None
        if self.status.code == 2000:
            scenario_id = self._persist_to_db(map_title, metadata)
            if cache_key is not None and not cache_hit:
                self._store_in_computation_cache(cache_key)

        response = {
            "data": {
                "mapTitle": map_title,
                "scenarioId": scenario_id,
            },
            "status": self.status.get_status(),
        }
        self.logger.log("info", f"Finished running scenario in {time() - initial_time}sec.")
        return response

    # Source file names mirror ``db.scenario_store.read_result_blobs`` so a
    # cache restore can hydrate the temp directory back to the exact shape
    # the downstream ``_persist_to_db`` / report steps expect.
    _CACHE_TEMP_FILES = {
        "hazard_geojson": "hazards_geodata.json",
        "exposure_geojson": "exposures_geodata.json",
        "impact_geojson": "risks_geodata.json",
        "waterfall_data": "risks_waterfall_data.json",
        "costben_data": "cost_benefit_data.json",
    }

    def _derive_computation_cache_key(self) -> str | None:
        """Hash the scenario-identity tuple for the computation cache.

        Returns ``None`` when either input file is absent on disk — we
        cannot key a cache entry on content we cannot hash, and a missing
        file means the run is about to fail anyway.
        """
        entity_path = _DATA_ENTITIES_DIR / self.request_data.entity_filename
        hazard_path = _DATA_HAZARDS_DIR / self.request_data.hazard_filename
        if not entity_path.is_file() or not hazard_path.is_file():
            return None
        from provenance import sha256_file

        try:
            entity_sha = sha256_file(entity_path)
            hazard_sha = sha256_file(hazard_path)
        except OSError:
            return None
        return cache_store.derive_cache_key(
            country=self.request_data.country_name,
            hazard_type=self.request_data.hazard_type,
            scenario=self.request_data.scenario,
            exposure_economic=self.request_data.exposure_economic,
            exposure_non_economic=self.request_data.exposure_non_economic,
            ref_year=self.request_data.ref_year,
            future_year=self.request_data.future_year,
            annual_growth=self.request_data.annual_growth,
            entity_sha256=entity_sha,
            hazard_sha256=hazard_sha,
        )

    def _restore_from_computation_cache(self, cache_key: str) -> bool:
        """Hydrate the temp dir from a cached bundle. Returns ``True`` on hit."""
        try:
            raw = cache_store.get(cache_key)
        except Exception as exc:
            self.logger.log("warning", f"Computation-cache lookup failed: {exc}")
            return False
        if not raw:
            return False
        try:
            bundle = cache_store.decode_bundle(raw)
        except Exception as exc:
            self.logger.log("warning", f"Computation-cache decode failed: {exc}")
            return False
        DATA_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        wrote_any = False
        for result_type, filename in self._CACHE_TEMP_FILES.items():
            blob = bundle.get(result_type)
            if blob is None:
                continue
            (DATA_TEMP_DIR / filename).write_bytes(blob)
            wrote_any = True
        if not wrote_any:
            return False
        self.base_handler.update_progress(100, "Scenario run successfully (cache hit).")
        self.logger.log("info", f"Computation-cache hit for key {cache_key[:12]}...")
        return True

    def _store_in_computation_cache(self, cache_key: str) -> None:
        """Persist the just-produced temp-dir blobs under ``cache_key``."""
        bundle: dict[str, bytes] = {}
        for result_type, filename in self._CACHE_TEMP_FILES.items():
            path = DATA_TEMP_DIR / filename
            if path.is_file():
                bundle[result_type] = path.read_bytes()
        if not bundle:
            return
        try:
            cache_store.put(cache_key, "scenario_bundle", cache_store.encode_bundle(bundle))
        except Exception as exc:
            self.logger.log("warning", f"Computation-cache write failed: {exc}")

    def _collect_provenance(self):
        """Return a :class:`provenance.ProvenanceRecord` for the current run.

        Resolves the on-disk paths for the entity / hazard files the runner
        loaded (hashed by SHA-256) and the country config (hashed likewise).
        ``config_version`` is the integer version from the country config,
        stringified so DuckDB stores it verbatim.

        For custom countries (drop-ins under ``<user-data>/countries/<ISO3>``)
        the extensibility registry resolves the correct ``config.json`` path
        — so Scenario 5 of issue #56 gets the custom ``config_version`` and
        ``country_config_sha256`` recorded on the scenarios row, not the
        built-in ones.
        """
        entity_path = _DATA_ENTITIES_DIR / self.request_data.entity_filename
        hazard_path = _DATA_HAZARDS_DIR / self.request_data.hazard_filename
        country_config_path = _resolve_country_config_path(self.request_data.country_code)
        config_version_value = ""
        try:
            cfg = load_country_config(self.request_data.country_code)
            config_version_value = str(cfg.config_version)
        except CountryConfigError:
            # Custom-mode runs frequently skip country config; the empty
            # string satisfies the NOT NULL column without pretending a
            # version exists.
            pass
        return collect_provenance(
            entity_path=entity_path if entity_path.is_file() else None,
            hazard_path=hazard_path if hazard_path.is_file() else None,
            country_config_path=country_config_path if country_config_path.is_file() else None,
            config_version_value=config_version_value,
            random_seed=self.random_seed,
        )

    def _persist_to_db(self, map_title: str, metadata: dict) -> str | None:
        """Write the run to DuckDB: one ``scenarios`` row + N result blobs.

        Failures are logged but do not flip ``self.status`` — the in-memory
        response is still useful to the UI, and the next save-as attempt
        can always re-insert by UUID.
        """
        try:
            scenario_id = str(uuid.uuid4())
            params = {
                "country": self.request_data.country_name,
                "hazard_type": self.request_data.hazard_type,
                "scenario": self.request_data.scenario,
                "exposure_economic": self.request_data.exposure_economic,
                "exposure_non_economic": self.request_data.exposure_non_economic,
                "ref_year": self.request_data.ref_year,
                "future_year": self.request_data.future_year,
                "annual_growth": self.request_data.annual_growth,
                "is_era": self.request_data.is_era,
                "app_option": metadata["app_option"],
            }
            results = read_result_blobs(DATA_TEMP_DIR)
            provenance = self._collect_provenance().as_dict()
            # ``impact_summary`` is the run metadata + the derived map title
            # + the provenance stamp; it exists so the workspace list (and
            # the PDF export stub) can repopulate without having to inflate
            # the geojson blobs.
            summary = {
                **metadata,
                "map_title": map_title,
                "provenance": provenance,
                "reproducibility_note": REPRODUCIBILITY_NOTE,
            }
            results["impact_summary"] = json.dumps(summary).encode("utf-8")

            insert_scenario(
                scenario_id,
                params,
                results,
                provenance=provenance,
                name=map_title,
            )
            return scenario_id
        except Exception as exc:
            self.logger.log(
                "error",
                f"Failed to persist scenario to DuckDB. More info: {exc}",
            )
            return None


if __name__ == "__main__":
    req = json.loads(sys.argv[1])
    runner = RunScenario(req)
    resp = runner.run_scenario()
    print(json.dumps(resp))
