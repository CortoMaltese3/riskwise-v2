"""
Module for handling cost-benefit analysis operations.

This module contains the `CostBenefitHandler` class, which manages cost-benefit analysis
operations such as retrieving measures from DuckDB, loading discount rates, calculating
cost-benefit, and producing structured JSON payloads consumed by the frontend charts.

Classes:

- `CostBenefitHandler`:
    Class for handling cost-benefit analysis operations.

Methods:

- `get_measure_names_from_db`:
    Retrieve adaptation measure names for a hazard type from DuckDB.
- `get_discount_rates_from_excel`:
    Load discount rates from an Excel file.
- `calculate_cost_benefit`:
    Calculate cost-benefit analysis based on current and future hazard and entity data.
- `compute_waterfall_data`:
    Compute the structured waterfall payload for the frontend.
- `compute_cost_benefit_data`:
    Compute the structured cost-benefit payload for the frontend (Chart.js).
"""

import json

import duckdb
from climada.engine import CostBenefit, ImpactCalc
from climada.engine.cost_benefit import NO_MEASURE, risk_aai_agg
from climada.entity import DiscRates, Entity
from climada.hazard import Hazard

from constants import DATA_TEMP_DIR, REQUIREMENTS_DIR
from hazard.hazard_handler import HazardHandler
from logger_config import LoggerConfig

WATERFALL_DATA_FILENAME = "risks_waterfall_data.json"
COSTBEN_DATA_FILENAME = "cost_benefit_data.json"

hazard_handler = HazardHandler()
logger = LoggerConfig(logger_types=["file"])

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

    def get_discount_rates_from_excel(self) -> DiscRates:
        """
        Load discount rates from an Excel file.

        This function loads discount rates defined in an Excel file into a DiscRates object.
        It validates the existence of the file and uses the DiscRates class method `from_excel`
        to initialize the object. It also performs a check on the loaded data before returning.

        :return: A DiscRates instance populated with data from the Excel file.
                Returns None if an error occurs during file loading or data checking.
        :raises FileNotFoundError: If the specified Excel file does not exist.
        """
        dicsount_rates_path = REQUIREMENTS_DIR / "adaptation_measures.xlsx"

        try:
            # Attempt to load the measure set from the Excel file adaptation_measures.xlsx
            discount_rates = DiscRates().from_excel(dicsount_rates_path)
            discount_rates.check()
            return discount_rates

        except FileNotFoundError as e:
            # Log the case where the Excel file is not found and return None to continue the flow
            logger.log(
                "error",
                (
                    f"Adaptation measures excel file not found at {dicsount_rates_path}. "
                    f"More info: {e}"
                ),
            )
            return None
        except Exception as exc:
            # Log any unexpected errors and return None to avoid breaking the flow
            logger.log(
                "error",
                f"An unexpected error occurred while processing the Excel file. More info: {exc}",
            )
            return None

    # Calculate cost-benefit
    def calculate_cost_benefit(
        self,
        hazard_present: Hazard,
        entity_present: Entity,
        hazard_future: Hazard = None,
        entity_future: Entity = None,
        future_year: int = None,
    ) -> CostBenefit:
        """
        Calculates the cost-benefit analysis based on current and future hazard and entity data.

        :param hazard_present: The current hazard data.
        :type hazard_present: Hazard
        :param entity_present: The current entity data.
        :type entity_present: Entity
        :param hazard_future: The future hazard data.
        :type hazard_future: Hazard
        :param entity_future: The future entity data.
        :type entity_future: Entity
        :param future_year: The year in the future for which the analysis is performed.
        :type future_year: int
        :return: A CostBenefit object with the calculation results.
        :rtype: CostBenefit

        :raises Exception: If there's an error in the cost-benefit calculation process.
        """
        try:
            cost_benefit = CostBenefit()
            cost_benefit.calc(
                hazard_present,
                entity_present,
                hazard_future,
                entity_future,
                future_year,
                risk_aai_agg,
                save_imp=True,
            )

            return cost_benefit
        except Exception as e:
            raise Exception(f"Failed to calculate cost-benefit: {e}") from e

    def compute_waterfall_data(
        self,
        cost_benefit: CostBenefit,
        hazard_present: Hazard,
        entity_present: Entity,
        hazard_future: Hazard,
        entity_future: Entity,
    ) -> dict:
        """
        Compute the structured waterfall payload for the frontend.

        Reads the present-day and future no-measure risks straight off
        ``cost_benefit`` (populated by ``calc()`` regardless of
        ``save_imp``) and only recomputes the middle ``risk_dev`` term
        (future entity against present hazard), which CLIMADA does not
        retain. The result is persisted as JSON in ``DATA_TEMP_DIR`` so
        ``run_fetch_waterfall.py`` can serve it through the FastAPI
        endpoint after the scenario run completes.
        """
        try:
            present_year = entity_present.exposures.ref_year
            future_year = entity_future.exposures.ref_year

            risk_present = float(cost_benefit.imp_meas_present[NO_MEASURE]["risk"])
            risk_future = float(cost_benefit.imp_meas_future[NO_MEASURE]["risk"])

            imp_dev = ImpactCalc(
                entity_future.exposures, entity_future.impact_funcs, hazard_present
            ).impact(assign_centroids=False)
            risk_dev = float(risk_aai_agg(imp_dev))

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
        cost_benefit: CostBenefit,
        entity_present: Entity,
        entity_future: Entity,
    ) -> dict:
        """
        Compute the structured cost-benefit payload for the frontend.

        Reads per-measure cost, benefit and benefit/cost ratio off the
        CLIMADA ``CostBenefit`` object: ``benefit[m]`` is the monetary
        averted damage, ``imp_meas_future[m]['cost'][0]`` is the measure
        cost, and ``cost_ben_ratio[m]`` is ``cost / benefit`` — inverted
        here so the frontend can rank measures by benefit per currency
        unit. The result is persisted as JSON in ``DATA_TEMP_DIR`` so
        ``run_fetch_costbenefit.py`` can serve it through the FastAPI
        endpoint after the scenario run completes.
        """
        try:
            measures = []
            for meas_name, ratio in cost_benefit.cost_ben_ratio.items():
                benefit = float(cost_benefit.benefit.get(meas_name, 0.0))
                cost_tuple = cost_benefit.imp_meas_future.get(meas_name, {}).get("cost", (0.0, 0.0))
                cost = float(cost_tuple[0])
                # cost_ben_ratio is cost/benefit; invert so the chart shows
                # benefit per currency spent. Guard against the ratio being
                # zero (no benefit) by falling back to 0.0.
                benefit_cost_ratio = float(1 / ratio) if ratio else 0.0
                measures.append(
                    {
                        "name": str(meas_name),
                        "cost": cost,
                        "benefit": benefit,
                        "benefit_cost_ratio": benefit_cost_ratio,
                    }
                )

            payload = {
                "currency_unit": str(getattr(cost_benefit, "unit", "") or ""),
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
