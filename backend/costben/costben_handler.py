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
import numpy as np
from backend.constants import DATA_TEMP_DIR
from backend.hazard.hazard_handler import HazardHandler
from backend.logger_config import LoggerConfig

from backend.engine.types import CostBenefitResult, MeasureSpec

WATERFALL_DATA_FILENAME = "risks_waterfall_data.json"
COSTBEN_DATA_FILENAME = "cost_benefit_data.json"

hazard_handler = HazardHandler()
logger = LoggerConfig(logger_types=["file"])


def _measure_specs_from_entity(entity: Any) -> list[MeasureSpec]:
    """Convert an entity's measures into the engine adapter's ``MeasureSpec`` list.

    The entity's ``MeasureSet`` is walked and each per-hazard measure is copied across.
    Field names already align with the engine adapter contract.
    """
    specs: list[MeasureSpec] = []
    measure_set = entity.measures
    if measure_set is None:
        return specs

    for haz_type, names in measure_set.get_names().items():
        for name in names:
            m = measure_set.get_measure(haz_type=haz_type, name=name)
            specs.append(
                MeasureSpec(
                    name=str(m.name),
                    haz_type=str(haz_type),
                    cost=float(getattr(m, "cost", 0.0) or 0.0),
                    cost_unit="USD",
                    hazard_freq_cutoff=_opt_float(getattr(m, "hazard_freq_cutoff", None)),
                    hazard_inten_imp=_opt_float(getattr(m, "hazard_inten_imp", (None, None))[0]),
                    mdd_impact_a=_opt_float(getattr(m, "mdd_impact", (None, None))[0]),
                    mdd_impact_b=_opt_float(getattr(m, "mdd_impact", (None, None))[1]),
                    paa_impact_a=_opt_float(getattr(m, "paa_impact", (None, None))[0]),
                    paa_impact_b=_opt_float(getattr(m, "paa_impact", (None, None))[1]),
                )
            )
    return specs


def _opt_float(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f


def _disc_rate_scalar(disc_rates: Any, default: float = 0.02) -> float:
    """Collapse a per-year discount-rate array (or scalar) to a single scalar.

    Uses the arithmetic mean when an iterable of per-year rates is supplied;
    falls back to ``default`` when nothing usable is provided.
    """
    if disc_rates is None:
        return default
    if isinstance(disc_rates, (int, float)):
        return float(disc_rates)
    rates = getattr(disc_rates, "rates", None)
    if rates is None or len(rates) == 0:
        return default
    return float(np.mean(np.asarray(rates, dtype=np.float64)))


def _calculate_via_engine(
    hazard_present: Any,
    entity_present: Any,
    hazard_future: Any,
    entity_future: Any,
    future_year: int | None,
) -> list[CostBenefitResult]:
    """Run ``cc.calc_cost_benefit`` via the engine adapter and normalise the output.

    Builds engine ``Hazard`` / ``Exposures`` / ``ImpactFuncSet`` from the
    incoming CLIMADA objects (mirroring ``impact_handler._calculate_via_engine``),
    converts the entity's ``MeasureSet`` to ``MeasureSpec``s and feeds them to
    ``build_measure``, collapses ``DiscRates`` to a scalar, and projects the
    engine's ``CostBenefitResult`` list into riskwise's domain shape.
    """
    if not _has_measures(entity_present):
        return []

    from backend.engine.adapter import build_exposures, build_hazard, build_measure
    from backend.engine.types import ExposureArrays

    try:
        exposure = entity_present.exposures
        exposure.assign_centroids(hazard_present, overwrite=False)
        gdf = exposure.gdf

        centr_col = f"centr_{hazard_present.haz_type}"
        centroid_idx = gdf[centr_col].values

        impf_col = f"impf_{hazard_present.haz_type}"
        impf_id = (
            gdf[impf_col].values if impf_col in gdf.columns else np.ones(len(gdf), dtype=np.int64)
        )

        cc_exposure = build_exposures(
            ExposureArrays(
                values=gdf["value"].values,
                centroid_idx=centroid_idx,
                impf_id=impf_id,
                lat=gdf.geometry.y.values,
                lon=gdf.geometry.x.values,
                value_unit=getattr(exposure, "value_unit", "USD"),
            )
        )
        cc_hazard_present = build_hazard(_hazard_arrays(hazard_present))
        cc_hazard_future = (
            build_hazard(_hazard_arrays(hazard_future))
            if hazard_future is not None
            else cc_hazard_present
        )

        specs = _measure_specs_from_entity(entity_present)
        cc_measures = [build_measure(s) for s in specs]

        discount_rate = _disc_rate_scalar(getattr(entity_present, "disc_rates", None))

        present_year = int(getattr(exposure, "ref_year", 2020))
        future_year_int = int(future_year) if future_year is not None else present_year

        from backend.engine.adapter import run_cost_benefit

        engine_results = run_cost_benefit(
            hazard_present=cc_hazard_present,
            hazard_future=cc_hazard_future,
            exposures=cc_exposure,
            impfset=entity_present.impact_funcs,
            measures=cc_measures,
            discount_rate=discount_rate,
            present_year=present_year,
            future_year=future_year_int,
        )
    except Exception as exc:
        raise Exception(f"Failed to calculate cost-benefit via engine: {exc}") from exc

    return [
        CostBenefitResult(
            name=str(r.name),
            cost=float(r.cost),
            benefit=float(r.benefit),
            bcr=float(r.bcr),
            risk_baseline_present=float(r.risk_baseline_present),
            risk_baseline_future=float(r.risk_baseline_future),
        )
        for r in engine_results
    ]


def _hazard_arrays(haz: Any):
    from backend.engine.types import HazardArrays

    return HazardArrays(
        haz_type=haz.haz_type,
        intensity_unit=haz.units,
        intensity=haz.intensity,
        frequency=haz.frequency,
        centroid_lat=haz.centroids.lat,
        centroid_lon=haz.centroids.lon,
        event_names=tuple(haz.event_name) if haz.event_name else None,
    )


def _aai_via_engine(exposures: Any, impfset: Any, hazard: Any) -> float:
    """Compute the average annual impact (``aai_agg``) via the engine adapter."""
    from backend.engine.adapter import run_impact

    impact = run_impact(hazard, exposures, impfset, save_mat=False)
    return float(impact.aai_agg)


def _has_measures(entity: Any) -> bool:
    if entity is None or entity.measures is None:
        return False
    names_by_haz = entity.measures.get_names()
    return any(len(v) > 0 for v in names_by_haz.values())


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
        except Exception as exc:
            logger.log("error", f"Failed to fetch measures from DB. More info: {exc}")
            return []

    def calculate_cost_benefit(
        self,
        hazard_present: Any,
        entity_present: Any,
        hazard_future: Any = None,
        entity_future: Any = None,
        future_year: int = None,
    ) -> list[CostBenefitResult]:
        """Calculate per-measure cost-benefit results via the climate-lama-engine adapter.

        Returns a normalised ``list[CostBenefitResult]`` — one entry per measure,
        with ``cost`` / ``benefit`` / ``bcr`` plus the no-measure baseline risks
        needed by the waterfall payload. With zero measures, returns an empty list
        without raising.
        """
        return _calculate_via_engine(
            hazard_present, entity_present, hazard_future, entity_future, future_year
        )

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
            present_year = entity_present.exposures.ref_year
            future_year = entity_future.exposures.ref_year

            if cost_benefit_results:
                risk_present = float(cost_benefit_results[0].risk_baseline_present)
                risk_future = float(cost_benefit_results[0].risk_baseline_future)
            else:
                risk_present = _aai_via_engine(
                    entity_present.exposures, entity_present.impact_funcs, hazard_present
                )
                risk_future = _aai_via_engine(
                    entity_future.exposures, entity_future.impact_funcs, hazard_future
                )

            risk_dev = _aai_via_engine(
                entity_future.exposures, entity_future.impact_funcs, hazard_present
            )

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
        except Exception as e:
            logger.log("error", f"Failed to compute waterfall data. More info: {e}")
            raise Exception(f"Failed to compute waterfall data: {e}") from e

    def compute_cost_benefit_data(
        self,
        cost_benefit_results: list[CostBenefitResult],
        entity_present: Any,
        entity_future: Any,
    ) -> dict:
        """Compute the structured cost-benefit payload for the frontend.

        Projects ``list[CostBenefitResult]`` into the JSON shape consumed by
        the Chart.js cost-benefit chart. Field names are unchanged from the
        pre-Phase-6 payload — ``benefit_cost_ratio`` is the engine's ``bcr``
        (benefit/cost), already inverted at the handler boundary if the
        CLIMADA branch produced it. The result is persisted as JSON in
        ``DATA_TEMP_DIR`` so ``run_fetch_costbenefit.py`` can serve it
        through the FastAPI endpoint after the scenario run completes.
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

            payload = {
                "currency_unit": str(entity_present.exposures.value_unit or ""),
                "present_year": int(entity_present.exposures.ref_year),
                "future_year": int(entity_future.exposures.ref_year),
                "measures": measures,
            }

            filename = DATA_TEMP_DIR / COSTBEN_DATA_FILENAME
            with open(filename, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            return payload
        except Exception as e:
            logger.log("error", f"Failed to compute cost-benefit data. More info: {e}")
            raise Exception(f"Failed to compute cost-benefit data: {e}") from e
