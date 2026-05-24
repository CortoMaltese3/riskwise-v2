"""Scenario DB persistence + provenance collection."""

import json
import uuid
from pathlib import Path
from typing import Any

import duckdb

from backend.constants import COUNTRIES_DIR, DATA_ENTITIES_DIR, DATA_HAZARDS_DIR, DATA_TEMP_DIR
from backend.countries.loader import CountryConfigError, load_country_config
from backend.db import insert_scenario, read_result_blobs
from backend.provenance import REPRODUCIBILITY_NOTE
from backend.provenance import collect as collect_provenance
from backend.scenario.request import RequestData


def _resolve_country_config_path(country_code: str) -> Path:
    """Return the ``config.json`` path for ``country_code`` (built-in or custom).

    The extensibility registry owns the mapping from ISO3 → directory, so
    custom drop-ins under ``<user-data>/countries/<ISO3>`` return the
    user-data path here and the provenance SHA points at the same file
    the loader actually read. Unknown codes fall through to the built-in
    tree so the empty-path branch in provenance collection behaves exactly
    as before.
    """
    from backend.extensibility.registry import get_registry as get_country_registry

    iso3 = country_code.upper()
    entry = get_country_registry().get(iso3)
    if entry is not None:
        return entry.config_path
    return COUNTRIES_DIR / iso3 / "config.json"


class RunPersister:
    """Collect provenance and write the scenario result to DuckDB."""

    def __init__(self, logger: Any, request_data: RequestData, random_seed: int):
        self.logger = logger
        self.request_data = request_data
        self.random_seed = random_seed

    def collect_provenance(self):
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
        entity_path = DATA_ENTITIES_DIR / self.request_data.entity_filename
        hazard_path = DATA_HAZARDS_DIR / self.request_data.hazard_filename
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

    def persist(self, map_title: str, metadata: dict) -> str | None:
        """Write the run to DuckDB: one ``scenarios`` row + N result blobs.

        Failures are logged but do not flip the runner's status — the
        in-memory response is still useful to the UI, and the next save-as
        attempt can always re-insert by UUID.
        """
        try:
            scenario_id = str(uuid.uuid4())
            params = {
                "country": self.request_data.country_name,
                "hazard_type": self.request_data.hazard_type,
                "scenario": self.request_data.scenario,
                "exposure_type": self.request_data.exposure_type,
                "asset_type": self.request_data.asset_type,
                "ref_year": self.request_data.ref_year,
                "future_year": self.request_data.future_year,
                "annual_growth": self.request_data.annual_growth,
                "is_era": self.request_data.is_era,
                "app_option": metadata["app_option"],
            }
            results = read_result_blobs(DATA_TEMP_DIR)
            provenance = self.collect_provenance().as_dict()
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
                impact_function_override=self.request_data.impact_function_override,
            )
            return scenario_id
        except (duckdb.Error, OSError, ValueError, KeyError, TypeError) as exc:
            self.logger.error(
                f"Failed to persist scenario to DuckDB. More info: {exc}",
            )
            return None
