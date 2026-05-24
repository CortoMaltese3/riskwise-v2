"""Scenario request data container and entity-measure filtering.

:class:`RequestData` is a plain dataclass holding the parameters of a
single scenario run after the raw UI payload is sanitized. It carries no
service handlers; the runner owns those and passes ``RequestData`` in.
"""

from dataclasses import dataclass, field, is_dataclass, replace
from typing import Any

from backend.hazard.hazard_handler import HazardHandler
from backend.utils.country import get_iso3_country_code, sanitize_country_name


def _filter_entity_measures(
    entity: Any, selected_ids: list[str], logger: Any
) -> tuple[Any, list[str]]:
    """Return ``entity`` with its ``measures`` scoped to ``selected_ids``.

    The second element of the tuple is the list of selected names that
    were dropped (selected by the user but absent on the entity), so the
    runner can surface them to the UI via ``skippedMeasures`` rather than
    only logging the silent backend filter (issue #450).

    An empty ``selected_ids`` means "no filter — run every measure on the
    entity"; the entity is returned unchanged with an empty skip list.
    Matching is by ``MeasureSpec.name`` because xlsx-loaded measures only
    carry a name; the catalog's row ``id`` is a per-seed UUID and would
    not match anything on the entity side. Unknown IDs do not crash the
    run — they are accumulated in the returned skip list instead.
    """
    if not selected_ids:
        return entity, []
    selected = set(selected_ids)
    measures = list(getattr(entity, "measures", []) or [])
    available_names = {getattr(m, "name", None) for m in measures}
    filtered = [m for m in measures if getattr(m, "name", None) in selected]
    skipped = [name for name in selected_ids if name not in available_names]
    if not filtered:
        logger.warning(
            "selected_measure_ids matched no measures on the entity; "
            "cost-benefit will be empty for this run."
        )
    if is_dataclass(entity):
        return replace(entity, measures=filtered), skipped
    # Non-dataclass entities (test stubs / mocks) get the attribute mutated
    # in place; this avoids forcing every test fixture to be a dataclass.
    try:
        entity.measures = filtered
    except AttributeError:
        # Read-only stub — log and leave untouched so the pipeline keeps
        # progressing and the test failure (if any) surfaces downstream.
        logger.warning("Could not filter measures on entity; attribute is read-only.")
    return entity, skipped


@dataclass
class RequestData:
    """Plain data container for a scenario request.

    All fields are either primitive values taken directly from the UI
    payload or derived via :py:meth:`__post_init__` from those primitives.
    """

    adaptation_measures: list[str]
    annual_growth: float
    country_name: str
    country_code: str
    entity_filename: str
    exposure_type: str
    asset_type: str
    hazard_filename: str
    hazard_type: str
    hazard_code: str
    is_era: bool
    scenario: str
    time_horizon: tuple[int, int]
    selected_measure_ids: list[str] = field(default_factory=list)
    # Custom-mode IF override (#453). ``None`` means "run the entity
    # workbook unchanged"; otherwise the runner patches the entity's
    # ``impfset_specs`` with this spec before ``calculate_impact``. The
    # dict mirrors :class:`backend.engine.types.ImpactFunctionSpec`.
    impact_function_override: dict | None = None
    ref_year: int = field(init=False)
    future_year: int = field(init=False)

    def __post_init__(self):
        self.ref_year = self.time_horizon[0]
        self.future_year = self.time_horizon[1]

    @classmethod
    def from_request(
        cls,
        request: dict,
        hazard_handler: HazardHandler,
    ) -> "RequestData":
        """Build a ``RequestData`` from the raw UI payload plus the hazard
        handler needed to derive the engine hazard code."""
        country_name = sanitize_country_name(request.get("countryName", ""))
        raw_selected = request.get("selectedMeasureIds") or []
        selected_measure_ids = [str(x) for x in raw_selected]
        raw_override = request.get("impactFunctionOverride")
        impact_function_override = dict(raw_override) if isinstance(raw_override, dict) else None
        return cls(
            adaptation_measures=request.get("adaptationMeasures", []),
            annual_growth=request.get("annualGrowth", 0),
            country_name=country_name,
            country_code=get_iso3_country_code(country_name),
            entity_filename=request.get("exposureFile", ""),
            exposure_type=request.get("exposureType") or "",
            asset_type=request.get("assetType") or "",
            hazard_filename=request.get("hazardFile", ""),
            hazard_type=request.get("hazardType", ""),
            hazard_code=hazard_handler.get_hazard_code(request.get("hazardType", "")),
            is_era=request.get("isEra", False),
            scenario=request.get("scenario", ""),
            time_horizon=request.get("timeHorizon", [2024, 2050]),
            selected_measure_ids=selected_measure_ids,
            impact_function_override=impact_function_override,
        )
