"""Macroeconomic data handler — reads CRED timeseries from DuckDB."""

from __future__ import annotations

import duckdb

from logging_config import get_logger

_log = get_logger("macroeconomic.handler")


class MacroeconomicHandler:
    def __init__(self, conn: duckdb.DuckDBPyConnection | None = None) -> None:
        self._conn = conn

    def _get_conn(self) -> duckdb.DuckDBPyConnection:
        if self._conn is not None:
            return self._conn
        from db.connection import get_connection

        return get_connection()

    def _get_builtin_dataset_id(self, conn: duckdb.DuckDBPyConnection) -> str | None:
        row = conn.execute(
            "SELECT id FROM cred_datasets WHERE is_builtin = TRUE LIMIT 1"
        ).fetchone()
        if row is None:
            _log.warning("cred_handler.no_builtin_dataset")
            return None
        return row[0]

    def get_cred_data_from_db(self, dataset_id: str | None = None) -> list[dict]:
        """Return all CRED rows for *dataset_id* (default: built-in dataset).

        The returned dicts preserve the original xlsx column names so that
        the frontend's client-side filtering logic is unchanged.
        """
        conn = self._get_conn()
        try:
            if dataset_id is None:
                dataset_id = self._get_builtin_dataset_id(conn)
                if dataset_id is None:
                    return []

            rows = conn.execute(
                """
                SELECT country, scenario, adpatation, variable AS economic_indicator,
                       sector AS economic_sector, year, value AS proportion_change_from_baseline
                FROM cred_data
                WHERE dataset_id = ?
                ORDER BY country, scenario, adpatation, variable, sector, year
                """,
                [dataset_id],
            ).fetchall()

            cols = [
                "country",
                "scenario",
                "adpatation",
                "economic_indicator",
                "economic_sector",
                "year",
                "proportion_change_from_baseline",
            ]
            return [dict(zip(cols, r)) for r in rows]
        finally:
            if self._conn is None:
                conn.close()

    def get_chart_data(
        self,
        country: str,
        scenario: str,
        sector: str,
        variable: str,
        dataset_id: str | None = None,
    ) -> dict:
        """Return chart-ready timeseries for a single country/scenario/sector/variable.

        Response shape::

            {
              "years": [2024, 2025, ...],
              "datasets": [{"label": "0% Adaptation", "data": [...]}, ...],
            }
        """
        conn = self._get_conn()
        try:
            if dataset_id is None:
                dataset_id = self._get_builtin_dataset_id(conn)
                if dataset_id is None:
                    return {"years": [], "datasets": []}

            rows = conn.execute(
                """
                SELECT year, adpatation, value
                FROM cred_data
                WHERE dataset_id = ?
                  AND country    = ?
                  AND scenario   = ?
                  AND sector     = ?
                  AND variable   = ?
                ORDER BY adpatation, year
                """,
                [dataset_id, country, scenario, sector, variable],
            ).fetchall()

            if not rows:
                return {"years": [], "datasets": []}

            years = sorted({r[0] for r in rows})
            year_idx = {y: i for i, y in enumerate(years)}
            groups: dict[str, list[float | None]] = {}
            for year, adp, value in rows:
                label = (
                    "Without adaptation"
                    if adp is None or adp == 0
                    else f"{adp * 100:.0f}% Adaptation"
                )
                if label not in groups:
                    groups[label] = [None] * len(years)
                groups[label][year_idx[year]] = value

            datasets = [{"label": lbl, "data": vals} for lbl, vals in groups.items()]
            return {"years": years, "datasets": datasets}
        finally:
            if self._conn is None:
                conn.close()
