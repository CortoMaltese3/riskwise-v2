"""Resolve the *active* impact function for a (country, hazard, exposure) triple.

This is the read-only inspector backing the Risk-input Impact Function panel
(issue #452). It deliberately reads the same entity XLSX the scenario runner
consumes — ``backend.engine.loaders.xlsx.load_entity_xlsx`` — so the viewer
cannot drift from what the engine will actually apply. The non-runtime
``ImpactFunctionRegistry`` in :mod:`backend.impact.registry` is documentation
and is intentionally **not** consulted here.

For ERA mode the canonical filename ``entity_TODAY_{ISO3}_{HAZARD}_{EXPOSURE}.xlsx``
is rebuilt from the request inputs. For custom mode the caller supplies an
``entity_file`` (relative paths resolve under :data:`DATA_ENTITIES_DIR`, the
same root the entity handler uses).

Each shipped ERA entity workbook holds the impact functions for one exposure
type, so the requested ``haz_type`` is normally enough to pick the spec. When
several functions share that ``haz_type`` (a user-supplied workbook can carry
more than one), the resolver falls back to the most-common ``impf_id`` in the
exposure rows — the same id the engine would resolve to at run time.
"""

from __future__ import annotations

from pathlib import Path

from backend.constants import DATA_ENTITIES_DIR
from backend.engine.loaders._errors import EntityLoadError
from backend.engine.loaders.xlsx import load_entity_xlsx
from backend.engine.types import ImpactFunctionSpec
from backend.models.errors import RiskWiseError

# Hazard-type → engine peril code. Kept here as a small inline map so the
# resolver does not have to instantiate ``HazardHandler`` (and the CLIMADA
# imports it pulls in) just to translate a string.
_HAZARD_TYPE_TO_CODE: dict[str, str] = {
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


class ImpactFunctionNotFoundError(RiskWiseError):
    """No matching impact function (or its source XLSX) could be located."""

    code = "impact_function_not_found"
    http_status = 404
    message = "Impact function not found."


def _resolve_iso3(country: str) -> str | None:
    # Imported lazily because ``pycountry`` pulls in a large data file and we
    # do not need it for the custom-entity-file branch.
    from backend.utils.country import get_iso3_country_code

    return get_iso3_country_code(country)


def _entity_path(country: str, haz_code: str, exposure: str) -> Path:
    iso3 = _resolve_iso3(country)
    if not iso3:
        raise ImpactFunctionNotFoundError(f"Unknown country: {country!r}")
    filename = f"entity_TODAY_{iso3}_{haz_code}_{exposure}.xlsx"
    return DATA_ENTITIES_DIR / filename


def _select_spec(
    specs: list,
    haz_code: str,
    impf_ids,
) -> ImpactFunctionSpec:
    """Pick the spec matching ``haz_code``; disambiguate via the exposure impf_id column."""
    matching = [s for s in specs if s.haz_type == haz_code]
    if not matching:
        raise ImpactFunctionNotFoundError(
            f"No impact function with haz_type={haz_code!r} in entity workbook"
        )
    if len(matching) == 1:
        return matching[0]

    # Multiple functions share the hazard — pick the one the engine would
    # actually apply (the most-common impf_id in the exposure rows).
    import numpy as np

    ids = np.asarray(impf_ids, dtype=np.int64)
    if ids.size > 0:
        values, counts = np.unique(ids, return_counts=True)
        most_common_id = int(values[counts.argmax()])
        for spec in matching:
            if spec.id == most_common_id:
                return spec
    return matching[0]


def get_active_impact_function(
    country: str,
    hazard: str,
    exposure: str,
    entity_file: str | None = None,
) -> ImpactFunctionSpec:
    """Return the impact-function spec the engine will apply for this selection.

    Parameters mirror the UI selection. ``entity_file`` short-circuits the
    canonical-filename derivation and is the custom-mode entry point.

    Raises :class:`ImpactFunctionNotFoundError` when the canonical entity file
    is missing, the country/hazard cannot be resolved, or the workbook holds
    no impact function with the requested ``haz_type``.
    """
    haz_code = _HAZARD_TYPE_TO_CODE.get(hazard)
    if not haz_code:
        raise ImpactFunctionNotFoundError(f"Unknown hazard: {hazard!r}")

    if entity_file:
        path = Path(entity_file)
        if not path.is_absolute():
            path = DATA_ENTITIES_DIR / entity_file
    else:
        path = _entity_path(country, haz_code, exposure)

    if not path.is_file():
        raise ImpactFunctionNotFoundError(f"Entity file not found: {path.name}")

    try:
        bundle = load_entity_xlsx(path)
    except EntityLoadError as exc:
        raise ImpactFunctionNotFoundError(str(exc)) from exc

    return _select_spec(bundle.impfset_specs, haz_code, bundle.exposures.impf_id)
