"""Pure helpers for the entity-driven measures picker (issue #450).

These helpers are exercised both by the FastAPI ``/measures`` endpoint
in :mod:`backend.api.measures` and by the unit tests in
``tests/unit/test_run_scenario_skipped_measures.py``; they have no
FastAPI dependencies so they live here, next to the cost-benefit
handler whose catalog rows they enrich.
"""

from __future__ import annotations

from backend.entity.entity_handler import EntityHandler
from backend.utils.country import get_iso3_country_code


def resolve_entity_filename(
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


def load_entity_measures(exposure_file: str | None) -> list[object] | None:
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


def enrich_with_catalog(
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
