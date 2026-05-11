"""
Module for handling cost-benefit analysis operations.

This module contains the `CostBenefitHandler` class, which manages cost-benefit analysis
operations such as retrieving measures from DuckDB, calculating cost-benefit, and producing
structured JSON payloads consumed by the frontend charts.

Classes:

- `CostBenefitHandler`:
    Class for handling cost-benefit analysis operations.

Methods:

- `get_measure_names_from_db`:
    Retrieve adaptation measure names for a hazard type from DuckDB.
- `calculate_cost_benefit`:
    Calculate cost-benefit analysis based on current and future hazard and entity data.
- `compute_waterfall_data`:
    Compute the structured waterfall payload for the frontend.
- `compute_cost_benefit_data`:
    Compute the structured cost-benefit payload for the frontend (Chart.js).
"""

import json
from typing import Any

import duckdb

from backend.constants import DATA_TEMP_DIR
from backend.engine.types import CostBenefitResult
from backend.hazard.hazard_handler import HazardHandler
from backend.logging_config import get_logger
from backend.models.errors import EngineError

WATERFALL_DATA_FILENAME = "risks_waterfall_data.json"
COSTBEN_DATA_FILENAME = "cost_benefit_data.json"

hazard_handler = HazardHandler()
logger = get_logger("backend.costben.costben_handler")


def _calculate_via_engine(
    hazard_present: Any,
    entity_present: Any,
    hazard_future: Any,
    future_year: int | None,
) -> list[CostBenefitResult]:
    """Run ``cc.calc_cost_benefit`` via the engine adapter and normalise the output.

    Consumes domain-typed inputs (:class:`HazardArrays`,
    :class:`EntityBundle`) — the entity loader already produces
    ``EntityBundle.measures`` as ``list[MeasureSpec]`` and stores the
    discount rate as a scalar, so no per-call conversion is needed.

    Returns an empty list only when the present entity carries no measures —
    no measures, no cost-benefit. Historical runs (``hazard_future=None``)
    still produce non-zero benefits: ``cc_hazard_present`` is substituted for
    the future hazard below, the engine's per-year benefit collapses to
    ``avoided_present + (avoided_future − avoided_present) × time_dep =
    avoided_present`` (because ``avoided_future = avoided_present`` when the
    hazards are identical), and the total benefit becomes
    ``avoided_present × Σ (1+g)^i × (1+r)^(−i)`` over the run's time horizon —
    a finite, positive number whenever a measure reduces today's risk.
    """
    if not _has_measures(entity_present):
        return []

    from backend.engine.adapter import (
        assign_centroids,
        build_exposures,
        build_hazard,
        build_impfset,
        build_measure,
        run_cost_benefit,
    )

    try:
        exposure = assign_centroids(entity_present.exposures, hazard_present)
        cc_exposure = build_exposures(exposure)
        cc_hazard_present = build_hazard(hazard_present)
        cc_hazard_future = (
            build_hazard(hazard_future) if hazard_future is not None else cc_hazard_present
        )
        cc_impfset = build_impfset(entity_present.impfset_specs)
        cc_measures = [build_measure(s) for s in entity_present.measures]

        present_year = entity_present.ref_year
        future_year_int = int(future_year) if future_year is not None else present_year

        engine_results = run_cost_benefit(
            hazard_present=cc_hazard_present,
            hazard_future=cc_hazard_future,
            exposures=cc_exposure,
            impfset=cc_impfset,
            measures=cc_measures,
            discount_rate=entity_present.discount_rate,
            present_year=present_year,
            future_year=future_year_int,
        )
    except (AttributeError, TypeError, ValueError, RuntimeError, ImportError) as exc:
        raise EngineError(f"Failed to calculate cost-benefit via engine: {exc}") from exc

    return [
        CostBenefitResult(
            name=str(r.measure_name),
            cost=float(r.cost),
            benefit=float(r.benefit),
            bcr=float(r.bcr),
            risk_baseline_present=float(r.risk_baseline_present),
            risk_baseline_future=float(r.risk_baseline_future),
        )
        for r in engine_results
    ]


def _aai_via_engine(entity: Any, hazard: Any) -> float:
    """Compute the average annual impact (``aai_agg``) for an :class:`EntityBundle`
    against a :class:`HazardArrays`.
    """
    from backend.engine.adapter import (
        assign_centroids,
        build_exposures,
        build_hazard,
        build_impfset,
        run_impact,
    )

    exposure = assign_centroids(entity.exposures, hazard)
    cc_exposure = build_exposures(exposure)
    cc_hazard = build_hazard(hazard)
    cc_impfset = build_impfset(entity.impfset_specs)
    impact = run_impact(cc_hazard, cc_exposure, cc_impfset, save_mat=False)
    return float(impact.aai_agg)


def _has_measures(entity: Any) -> bool:
    if entity is None:
        return False
    measures = getattr(entity, "measures", None) or []
    return len(measures) > 0


class CostBenefitHandler:
    """Class for handling cost-benefit analysis operations."""

    def get_measure_names_from_db(
        self,
        conn: duckdb.DuckDBPyConnection,
        hazard_code: str,
        measure_set_id: str | None = None,
    ) -> list[str]:
        """Return measure names for *hazard_code* from the canonical DuckDB store.

        When *measure_set_id* is supplied the query is scoped to that set;
        otherwise the built-in set is used. Returns an empty list when no
        measures are found so the caller can decide how to handle it.
        """
        measures = self.get_measures_from_db(conn, hazard_code, measure_set_id)
        return [m["name"] for m in measures]

    def get_measures_from_db(
        self,
        conn: duckdb.DuckDBPyConnection,
        hazard_code: str,
        measure_set_id: str | None = None,
        country_name: str | None = None,
    ) -> list[dict]:
        """Return full measure rows for *hazard_code*.

        Default (``measure_set_id`` omitted) merges the built-in set with
        every custom set whose measures apply to the hazard — and optionally
        the given country. A measure applies to a country when its ``country``
        column is NULL (set-wide) or a case-insensitive match. Each returned
        dict also carries the owning set's id, name, and ``is_builtin`` so
        the UI can render badges and tooltips without a second query.
        """
        hazard_type = hazard_handler.get_hazard_name(hazard_code) or hazard_code
        try:
            params: list[object] = [hazard_type]
            clauses = ["am.hazard_type = ?"]
            if measure_set_id:
                clauses.append("am.measure_set_id = ?")
                params.append(measure_set_id)
            if country_name:
                clauses.append("(am.country IS NULL OR LOWER(am.country) = LOWER(?))")
                params.append(country_name)

            rows = conn.execute(
                f"""
                SELECT
                    am.id,
                    am.measure_set_id,
                    ms.name  AS measure_set_name,
                    ms.is_builtin,
                    am.country,
                    am.hazard_type,
                    am.exposure_type,
                    am.name,
                    am.cost_factor,
                    am.hazard_reduction_percentage,
                    am.description,
                    am.source_reference
                FROM adaptation_measures am
                JOIN measure_sets ms ON ms.id = am.measure_set_id
                WHERE {" AND ".join(clauses)}
                ORDER BY ms.is_builtin DESC, ms.name, am.name
                """,
                params,
            ).fetchall()
            cols = [
                "id",
                "measure_set_id",
                "measure_set_name",
                "is_builtin",
                "country",
                "hazard_type",
                "exposure_type",
                "name",
                "cost_factor",
                "hazard_reduction_percentage",
                "description",
                "source_reference",
            ]
            return [dict(zip(cols, r, strict=True)) for r in rows]
        except duckdb.Error as exc:
            logger.error(f"Failed to fetch measures from DB. More info: {exc}")
            return []

    def calculate_cost_benefit(
        self,
        hazard_present: Any,
        entity_present: Any,
        hazard_future: Any = None,
        future_year: int = None,
    ) -> list[CostBenefitResult]:
        """Calculate per-measure cost-benefit results via the climate-lama-engine adapter.

        Returns a normalised ``list[CostBenefitResult]`` — one entry per measure,
        with ``cost`` / ``benefit`` / ``bcr`` plus the no-measure baseline risks
        needed by the waterfall payload. With zero measures, returns an empty list
        without raising. Historical runs (``hazard_future=None``) reuse
        ``hazard_present`` as the future hazard so the engine still produces
        per-measure benefits — see :func:`_calculate_via_engine` for the math.
        """
        return _calculate_via_engine(hazard_present, entity_present, hazard_future, future_year)

    def compute_waterfall_data(
        self,
        cost_benefit_results: list[CostBenefitResult],
        hazard_present: Any,
        entity_present: Any,
        hazard_future: Any,
        entity_future: Any,
    ) -> dict:
        """Compute the structured waterfall payload for the frontend.

        Reads the no-measure baseline risks from the first ``CostBenefitResult``
        (every entry carries the same baselines) and only recomputes the
        middle ``risk_dev`` term — future entity against present hazard —
        which is not part of the cost-benefit output. When the results list
        is empty (zero measures), baselines are computed via the engine adapter
        ``run_impact`` so the waterfall is still well-defined. The result is
        persisted as JSON in ``DATA_TEMP_DIR`` so ``run_fetch_waterfall.py``
        can serve it through the FastAPI endpoint after the scenario run
        completes.
        """
        try:
            present_year = entity_present.ref_year
            future_year = entity_future.ref_year

            if cost_benefit_results:
                risk_present = float(cost_benefit_results[0].risk_baseline_present)
                risk_future = float(cost_benefit_results[0].risk_baseline_future)
            else:
                risk_present = _aai_via_engine(entity_present, hazard_present)
                risk_future = _aai_via_engine(entity_future, hazard_future)

            risk_dev = _aai_via_engine(entity_future, hazard_present)

            economic_development = risk_dev - risk_present
            climate_change = risk_future - risk_dev

            categories = [
                {
                    "key": "risk_present",
                    "label": f"Risk {present_year}",
                    "value": risk_present,
                    "base": 0.0,
                },
                {
                    "key": "economic_development",
                    "label": "Economic development",
                    "value": economic_development,
                    "base": risk_present,
                },
                {
                    "key": "climate_change",
                    "label": "Climate change",
                    "value": climate_change,
                    "base": risk_dev,
                },
                {
                    "key": "risk_future",
                    "label": f"Risk {future_year}",
                    "value": risk_future,
                    "base": 0.0,
                },
            ]

            payload = {
                "present_year": int(present_year),
                "future_year": int(future_year),
                "measurement_unit": str(entity_present.exposures.value_unit or ""),
                "categories": categories,
            }

            filename = DATA_TEMP_DIR / WATERFALL_DATA_FILENAME
            with open(filename, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            return payload
        except (AttributeError, KeyError, TypeError, ValueError, OSError, RuntimeError) as e:
            logger.error(f"Failed to compute waterfall data. More info: {e}")
            raise EngineError(f"Failed to compute waterfall data: {e}") from e

    def compute_cost_benefit_data(
        self,
        cost_benefit_results: list[CostBenefitResult],
        entity_present: Any,
        future_year: int,
        entity_future: Any = None,
    ) -> dict:
        """Compute the structured cost-benefit payload for the frontend.

        Projects ``list[CostBenefitResult]`` into the JSON shape consumed by
        the Chart.js cost-benefit chart. Field names are unchanged from the
        pre-Phase-6 payload — ``benefit_cost_ratio`` is the engine's ``bcr``
        (benefit/cost), already inverted at the handler boundary if the
        CLIMADA branch produced it. The result is persisted as JSON in
        ``DATA_TEMP_DIR`` so ``run_fetch_costbenefit.py`` can serve it
        through the FastAPI endpoint after the scenario run completes.

        ``future_year`` is taken from the scenario request so the payload's
        time horizon reflects the user's selection even for historical runs,
        where no future :class:`EntityBundle` is constructed.
        """
        try:
            measures = [
                {
                    "name": r.name,
                    "cost": r.cost,
                    "benefit": r.benefit,
                    "benefit_cost_ratio": r.bcr,
                }
                for r in cost_benefit_results
            ]

            future_year_int = (
                int(entity_future.ref_year) if entity_future is not None else int(future_year)
            )
            payload = {
                "currency_unit": str(entity_present.exposures.value_unit or ""),
                "present_year": int(entity_present.ref_year),
                "future_year": future_year_int,
                "measures": measures,
            }

            filename = DATA_TEMP_DIR / COSTBEN_DATA_FILENAME
            with open(filename, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            return payload
        except (AttributeError, KeyError, TypeError, ValueError, OSError) as e:
            logger.error(f"Failed to compute cost-benefit data. More info: {e}")
            raise EngineError(f"Failed to compute cost-benefit data: {e}") from e
