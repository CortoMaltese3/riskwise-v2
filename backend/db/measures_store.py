"""DuckDB queries for adaptation measure set metadata."""

from __future__ import annotations

import duckdb
from db.connection import get_connection


def list_measure_sets(conn: duckdb.DuckDBPyConnection | None = None) -> list[dict]:
    """Return every measure set enriched with per-set measure counts.

    ``countries``/``hazards`` aggregate the distinct non-null values of each
    set's measures so the settings panel can render a concise "scope" column
    without a second round-trip. NULL country entries (the built-in set is
    country-agnostic) are left out of the aggregates and the UI renders an
    explicit "All" placeholder in that case.
    """
    owns_conn = conn is None
    if conn is None:
        conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT
                ms.id,
                ms.name,
                ms.uploaded_at,
                ms.is_builtin,
                ms.sha256,
                COUNT(am.id)                                          AS measure_count,
                STRING_AGG(DISTINCT am.country,     ', ' ORDER BY am.country)     AS countries,
                STRING_AGG(DISTINCT am.hazard_type, ', ' ORDER BY am.hazard_type) AS hazards
            FROM measure_sets ms
            LEFT JOIN adaptation_measures am ON am.measure_set_id = ms.id
            GROUP BY ms.id, ms.name, ms.uploaded_at, ms.is_builtin, ms.sha256
            ORDER BY ms.is_builtin DESC, ms.uploaded_at
            """
        ).fetchall()
        cols = [
            "id",
            "name",
            "uploaded_at",
            "is_builtin",
            "sha256",
            "measure_count",
            "countries",
            "hazards",
        ]
        return [dict(zip(cols, r, strict=True)) for r in rows]
    finally:
        if owns_conn:
            conn.close()
