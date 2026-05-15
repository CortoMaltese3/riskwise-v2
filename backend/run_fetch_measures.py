"""Fetch adaptation measures for the picker.

The picker is **entity-driven**: the source of truth is the entity
workbook the run will actually use (canonical ``entity_TODAY_*.xlsx`` for
ERA, uploaded workbook for custom). Each entity measure is enriched with
catalog metadata — display label (i18n key), source reference, built-in
flag — by joining on ``code`` first, then ``name`` (#429 alias bridge),
against the per-hazard catalog. Entity measures with no catalog match
still come through; the renderer falls back to the raw engine name.

This means:
  - the picker only ever shows measures the engine can actually run, so
    the "selected but skipped" snackbar collapses to a defensive corner;
  - the catalog/entity name mismatch (entity ``TP`` vs catalog
    ``adaptation_measures_trees_planting``) is resolved at fetch time;
  - the legacy ``entityMeasureNames`` applicability sentinel is gone —
    the picker IS the entity, so applicability is always 100%.
"""

from __future__ import annotations

from time import time

from backend.cli import Command, StatusCode
from backend.costben.costben_handler import CostBenefitHandler
from backend.db.connection import get_connection, resolve_db_path
from backend.entity.entity_handler import EntityHandler
from backend.hazard.hazard_handler import HazardHandler
from backend.progress import update_progress
from backend.utils.country import get_iso3_country_code
from backend.utils.strings import beautify_hazard_type

_EMPTY_DATA = {"adaptationMeasures": [], "measures": []}


def _resolve_entity_filename(
    exposure_file: str | None,
    country_name: str | None,
    hazard_code: str | None,
    exposure_type: str | None,
) -> str | None:
    """Pick the entity workbook to inspect.

    Custom mode supplies ``exposure_file`` directly. ERA mode does not,
    but the canonical ``entity_TODAY_{ISO3}_{HAZ}_{exposure}.xlsx`` can
    be rebuilt from country + hazard + exposure_type — the same path the
    scenario runner takes.
    """
    if exposure_file:
        return exposure_file
    if not (country_name and hazard_code and exposure_type):
        return None
    iso3 = get_iso3_country_code(country_name)
    if not iso3:
        return None
    return EntityHandler().get_entity_filename(iso3, hazard_code, exposure_type)


def _load_entity_measures(exposure_file: str | None) -> list[object] | None:
    """Return the list of ``MeasureSpec`` objects on the entity workbook.

    Returns ``None`` when the load fails so the caller can fall back to
    a catalog-only response (the picker still renders, just unenriched).
    """
    if not exposure_file:
        return None
    try:
        entity = EntityHandler().get_entity_from_xlsx(exposure_file)
    except (OSError, ValueError, KeyError):  # pragma: no cover - defensive
        return None
    if entity is None:
        return None
    return list(getattr(entity, "measures", []) or [])


def _enrich_with_catalog(
    entity_measures: list[object], catalog_rows: list[dict]
) -> list[dict]:
    """Pair each entity measure with its catalog row by ``code`` then ``name``.

    Entity measures that don't match anything in the catalog are still
    returned — the renderer falls back to the raw engine name. The
    response keeps the engine ``name`` as the keying field so the
    runtime filter (``MeasureSpec.name``) keeps matching unchanged.
    """
    by_code = {row["code"]: row for row in catalog_rows if row.get("code")}
    by_name = {row["name"]: row for row in catalog_rows if row.get("name")}
    enriched: list[dict] = []
    for em in entity_measures:
        engine_name = getattr(em, "name", None)
        if not isinstance(engine_name, str):
            continue
        catalog = by_code.get(engine_name) or by_name.get(engine_name)
        if catalog is not None:
            enriched.append(
                {
                    "id": catalog.get("id") or engine_name,
                    "name": engine_name,
                    "displayName": catalog.get("name"),
                    "is_builtin": bool(catalog.get("is_builtin", True)),
                    "source_reference": catalog.get("source_reference"),
                    "cost_factor": catalog.get("cost_factor"),
                    "hazard_reduction_percentage": catalog.get(
                        "hazard_reduction_percentage"
                    ),
                }
            )
        else:
            enriched.append(
                {
                    "id": engine_name,
                    "name": engine_name,
                    "displayName": None,
                    # Custom-uploaded entities get marked as custom by
                    # default — the picker badge then surfaces the
                    # "user supplied this" provenance.
                    "is_builtin": False,
                    "source_reference": None,
                    "cost_factor": None,
                    "hazard_reduction_percentage": None,
                }
            )
    return enriched


class RunFetchScenario(Command):
    def __init__(self, request: dict):
        super().__init__()
        self.costben_handler = CostBenefitHandler()
        self.hazard_handler = HazardHandler()
        self.request = request

    def valid_request(self) -> bool:
        if "hazardType" not in self.request:
            self.logger.error("Missing required field: hazardType")
            return False
        return True

    def execute(self) -> dict:
        initial_time = time()
        if not self.valid_request():
            return self.error_envelope("Invalid request: Missing required fields")

        hazard_type = self.request.get("hazardType", "")
        hazard_code = self.hazard_handler.get_hazard_code(hazard_type)
        hazard_beautified = beautify_hazard_type(hazard_type)

        update_progress(10, "Fetching adaptation measures...")
        conn = get_connection(resolve_db_path())
        try:
            catalog_rows = self.costben_handler.get_measures_from_db(
                conn,
                hazard_code,
                self.request.get("measureSetId"),
                self.request.get("countryName") or None,
            )
        finally:
            conn.close()

        entity_filename = _resolve_entity_filename(
            self.request.get("exposureFile"),
            self.request.get("countryName"),
            hazard_code,
            self.request.get("exposureType"),
        )
        entity_measures = _load_entity_measures(entity_filename)

        if entity_measures is None:
            # No entity to inspect (e.g. picker fired before exposure
            # was picked) — fall back to the raw catalog so the user
            # still sees something. The catalog ``name`` is also the
            # i18n display key, so ``displayName`` mirrors ``name`` here.
            measures = [
                {
                    "id": row.get("id") or row["name"],
                    "name": row["name"],
                    "displayName": row["name"],
                    "is_builtin": bool(row.get("is_builtin", True)),
                    "source_reference": row.get("source_reference"),
                    "cost_factor": row.get("cost_factor"),
                    "hazard_reduction_percentage": row.get("hazard_reduction_percentage"),
                }
                for row in catalog_rows
            ]
        else:
            measures = _enrich_with_catalog(entity_measures, catalog_rows)

        adaptation_measures = [m["name"] for m in measures]
        if not hazard_code or not measures:
            status_code = StatusCode.VALIDATION_ERROR
            message = f"No available adaptation measures for {hazard_beautified}."
        else:
            status_code = StatusCode.SUCCESS
            message = f"Fetched adaptation measures for {hazard_beautified} successfully."

        update_progress(100, message)
        self.logger.info(
            f"Finished fetching adaptation measures data in {time() - initial_time:.2f}sec.",
        )
        return {
            "data": {
                "adaptationMeasures": adaptation_measures,
                "measures": measures,
            },
            "status": {"code": status_code, "message": message},
        }

    def error_envelope(self, exc):
        return {
            "data": dict(_EMPTY_DATA),
            "status": {"code": StatusCode.ERROR, "message": str(exc)},
        }

    def run_fetch_measures(self) -> dict:
        return self.run()


if __name__ == "__main__":
    import json

    print(json.dumps(RunFetchScenario.main()))
