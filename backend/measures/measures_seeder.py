"""Seed the built-in adaptation measures into DuckDB on first launch.

Idempotent — computes the SHA-256 of the source xlsx and skips the insert
if a matching built-in ``measure_sets`` row already exists. Any validation
failure raises :class:`MeasureSeedError` with a structured message naming
the offending row; callers treat this as a fatal startup error.
"""

from __future__ import annotations

import math
import uuid
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from backend.logging_config import get_logger
from backend.provenance import sha256_file

_log = get_logger("measures.measures_seeder")

BUILTIN_MEASURE_SET_NAME = "Built-in Adaptation Measures v2024"

_PERIL_TO_HAZARD: dict[str, str] = {
    "HW": "heatwaves",
    "D": "drought",
    "FL": "flood",
}

REQUIRED_COLUMNS = {"name", "cost", "MDD impact a", "peril_ID"}


class MeasureSeedError(RuntimeError):
    """Raised when xlsx validation fails during the built-in migration."""


def _validate_row(row: dict[str, Any], row_index: int, seen: set[tuple]) -> None:
    cost = row.get("cost")
    try:
        if cost is None:
            raise ValueError("None")
        cf = float(cost)
        if math.isnan(cf):
            raise ValueError("NaN")
    except (TypeError, ValueError) as exc:
        raise MeasureSeedError(f"Row {row_index}: 'cost' must be numeric, got {cost!r}") from exc
    if cf <= 0:
        raise MeasureSeedError(f"Row {row_index}: cost_factor must be > 0, got {cf}")

    mdd = row.get("MDD impact a")
    try:
        if mdd is None:
            raise ValueError("None")
        mdd_f = float(mdd)
        if math.isnan(mdd_f):
            raise ValueError("NaN")
    except (TypeError, ValueError) as exc:
        raise MeasureSeedError(
            f"Row {row_index}: 'MDD impact a' must be numeric, got {mdd!r}"
        ) from exc
    hrp = (1.0 - mdd_f) * 100.0
    if not (0.0 <= hrp <= 100.0):
        raise MeasureSeedError(
            f"Row {row_index}: hazard_reduction_percentage {hrp:.2f} outside [0, 100]"
        )

    key = (row.get("country"), row.get("hazard_type"), None, str(row.get("name", "")), cf)
    if key in seen:
        raise MeasureSeedError(
            f"Row {row_index}: duplicate (country, hazard_type, exposure_type, name, cost_factor) "
            f"tuple: {key}"
        )
    seen.add(key)


def seed_builtin_measures(conn: duckdb.DuckDBPyConnection, xlsx_path: Path) -> None:
    """Insert the built-in adaptation measures unless already present.

    Uses the xlsx SHA-256 as the idempotency key so a re-packaged xlsx
    triggers a fresh seed rather than silently serving stale data.
    """
    try:
        sha = sha256_file(xlsx_path)
    except OSError as exc:
        raise MeasureSeedError(f"Cannot open '{xlsx_path}': {exc}") from exc

    existing = conn.execute(
        "SELECT id FROM measure_sets WHERE is_builtin = TRUE AND sha256 = ?",
        [sha],
    ).fetchone()
    if existing:
        _log.info("measures_seeder.skip", reason="already_seeded", sha256=sha[:12])
        return

    _log.info("measures_seeder.start", xlsx=str(xlsx_path), sha256=sha[:12])

    try:
        df = pd.read_excel(xlsx_path, sheet_name="measures")
    except (OSError, ValueError, ImportError) as exc:
        raise MeasureSeedError(f"Cannot read 'measures' sheet from '{xlsx_path}': {exc}") from exc

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise MeasureSeedError(f"xlsx is missing required columns: {sorted(missing)}")

    rows = df.to_dict(orient="records")
    measure_set_id = str(uuid.uuid4())
    seen: set[tuple] = set()
    enriched: list[dict] = []

    for i, row in enumerate(rows):
        peril_id = str(row.get("peril_ID", ""))
        hazard_type = _PERIL_TO_HAZARD.get(peril_id, peril_id)
        row["hazard_type"] = hazard_type
        row["country"] = None
        _validate_row(row, i, seen)
        enriched.append(
            {
                "id": str(uuid.uuid4()),
                "measure_set_id": measure_set_id,
                "country": None,
                "hazard_type": hazard_type,
                "exposure_type": None,
                "name": str(row["name"]),
                "cost_factor": float(row["cost"]),
                "hazard_reduction_percentage": (1.0 - float(row["MDD impact a"])) * 100.0,
                "description": None,
                "source_reference": "TODO — source not yet cited",
                "is_builtin": True,
            }
        )

    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(
            "INSERT INTO measure_sets (id, name, sha256, is_builtin) VALUES (?, ?, ?, TRUE)",
            [measure_set_id, BUILTIN_MEASURE_SET_NAME, sha],
        )
        conn.executemany(
            """
            INSERT INTO adaptation_measures
                (id, measure_set_id, country, hazard_type, exposure_type,
                 name, cost_factor, hazard_reduction_percentage,
                 description, source_reference, is_builtin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    r["id"],
                    r["measure_set_id"],
                    r["country"],
                    r["hazard_type"],
                    r["exposure_type"],
                    r["name"],
                    r["cost_factor"],
                    r["hazard_reduction_percentage"],
                    r["description"],
                    r["source_reference"],
                    r["is_builtin"],
                )
                for r in enriched
            ],
        )
        conn.execute("COMMIT")
    except (duckdb.Error, OSError, ValueError) as exc:
        conn.execute("ROLLBACK")
        raise MeasureSeedError(f"DB insert failed: {exc}") from exc

    _log.info("measures_seeder.done", measure_set_id=measure_set_id, rows=len(enriched))


def run_startup_measures_seed(xlsx_path: Path) -> None:
    """Resolve the production DB, run the seeder, and close the connection.

    Intended as the FastAPI lifespan entry point, called after migrations.
    """
    from backend.db.connection import get_connection, resolve_db_path

    db_path = resolve_db_path()
    conn = get_connection(db_path)
    try:
        seed_builtin_measures(conn, xlsx_path)
    finally:
        conn.close()
