"""Fetch adaptation measures for a given hazard/country from DuckDB.

The default path merges the built-in measure set with every applicable
custom set (issue #92). The response keeps the legacy ``adaptationMeasures``
list of names so the scenario-run pipeline continues to work unchanged, and
adds a ``measures`` field carrying the full metadata the UI needs to render
the Built-in/Custom badges and source-reference tooltips.
"""

from __future__ import annotations

from time import time

from backend.cli import Command, StatusCode
from backend.costben.costben_handler import CostBenefitHandler
from backend.db.connection import get_connection, resolve_db_path
from backend.entity.entity_handler import EntityHandler
from backend.hazard.hazard_handler import HazardHandler
from backend.progress import update_progress
from backend.utils.strings import beautify_hazard_type

_EMPTY_DATA = {"adaptationMeasures": [], "measures": [], "entityMeasureNames": None}


def _entity_measure_names(exposure_file: str | None) -> list[str] | None:
    """Return the measure names attached to the entity at ``exposure_file``.

    Returns ``None`` when no file is provided or the load fails — the
    renderer uses ``None`` as the "applicability unknown" sentinel so a
    missing entity file does not get rendered as "every catalog measure
    is unapplicable" (issue #450).
    """
    if not exposure_file:
        return None
    try:
        entity = EntityHandler().get_entity_from_xlsx(exposure_file)
    except (OSError, ValueError, KeyError):  # pragma: no cover - defensive
        return None
    if entity is None:
        return None
    measures = list(getattr(entity, "measures", []) or [])
    names = [getattr(m, "name", None) for m in measures]
    return [n for n in names if isinstance(n, str)]


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
            measures = self.costben_handler.get_measures_from_db(
                conn,
                hazard_code,
                self.request.get("measureSetId"),
                self.request.get("countryName") or None,
            )
        finally:
            conn.close()

        adaptation_measures = [m["name"] for m in measures]
        entity_measure_names = _entity_measure_names(self.request.get("exposureFile"))
        if not hazard_code or not adaptation_measures:
            status_code = StatusCode.VALIDATION_ERROR
            message = f"No available adaptation measures for {hazard_beautified}."
        else:
            status_code = StatusCode.SUCCESS
            message = f"Fetched adaptation measures for {hazard_beautified} successfully."

        update_progress(100, message)
        self.logger.info(f"Finished fetching adaptation measures data in {time() - initial_time:.2f}sec.",
        )
        return {
            "data": {
                "adaptationMeasures": adaptation_measures,
                "measures": measures,
                "entityMeasureNames": entity_measure_names,
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
