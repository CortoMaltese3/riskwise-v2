"""Seed the built-in adaptation measures into DuckDB on first launch.

Idempotent — skips the insert when a built-in ``measure_sets`` row with the
canonical name already exists. Bumping the catalog requires bumping the
version in :data:`BUILTIN_MEASURE_SET_NAME`. Any validation failure raises
:class:`MeasureSeedError` with a structured message naming the offending
row; callers treat this as a fatal startup error.

The catalog is checked in as ``requirements/adaptation_measures.json`` —
diffable, language-agnostic, and trivial to regenerate from a spreadsheet
when the science team updates the source data.
"""

from __future__ import annotations

import hashlib
import json
import math
import uuid
from pathlib import Path
from typing import Any

import duckdb

from backend.logging_config import get_logger

_log = get_logger("measures.measures_seeder")

BUILTIN_MEASURE_SET_NAME = "Built-in Adaptation Measures v2024"

_PERIL_TO_HAZARD: dict[str, str] = {
    "HW": "heatwaves",
    "D": "drought",
    "FL": "flood",
}

REQUIRED_FIELDS = {"name", "cost", "MDD impact a", "peril_ID"}


class MeasureSeedError(RuntimeError):
    """Raised when JSON validation fails during the built-in migration."""


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


def _load_records(json_path: Path) -> list[dict[str, Any]]:
    try:
        text = json_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise MeasureSeedError(f"Cannot open '{json_path}': {exc}") from exc
    try:
        records = json.loads(text)
    except json.JSONDecodeError as exc:
        raise MeasureSeedError(f"Invalid JSON in '{json_path}': {exc}") from exc
    if not isinstance(records, list):
        raise MeasureSeedError(f"'{json_path}' must contain a JSON array of measure rows")
    return records


def seed_builtin_measures(conn: duckdb.DuckDBPyConnection, json_path: Path) -> None:
    """Insert the built-in adaptation measures unless already present.

    Skips when a built-in set with :data:`BUILTIN_MEASURE_SET_NAME`
    already exists, so existing installs upgrade silently — bump the
    version in that constant when the catalog changes.
    """
    existing = conn.execute(
        "SELECT id FROM measure_sets WHERE is_builtin = TRUE AND name = ?",
        [BUILTIN_MEASURE_SET_NAME],
    ).fetchone()
    if existing:
        _log.info(
            "measures_seeder.skip",
            reason="already_seeded",
            set_name=BUILTIN_MEASURE_SET_NAME,
        )
        return

    records = _load_records(json_path)
    digest = hashlib.sha256(json_path.read_bytes()).hexdigest()
    _log.info("measures_seeder.start", source=str(json_path), sha256=digest[:12])

    for i, row in enumerate(records):
        missing = REQUIRED_FIELDS - set(row)
        if missing:
            raise MeasureSeedError(f"Row {i}: missing required fields: {sorted(missing)}")

    measure_set_id = str(uuid.uuid4())
    seen: set[tuple] = set()
    enriched: list[dict] = []

    for i, row in enumerate(records):
        peril_id = str(row.get("peril_ID", ""))
        hazard_type = _PERIL_TO_HAZARD.get(peril_id, peril_id)
        row["hazard_type"] = hazard_type
        row["country"] = None
        _validate_row(row, i, seen)
        # ``code`` aligns the catalog i18n key with the short code the
        # engine echoes back from the entity xlsx (#429). Empty / null
        # values stay NULL so the join in the cost-benefit handler
        # falls through to the raw engine name.
        raw_code = row.get("code")
        code_val = raw_code.strip() if isinstance(raw_code, str) and raw_code.strip() else None
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
                "source_reference": None,
                "is_builtin": True,
                "code": code_val,
            }
        )

    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(
            "INSERT INTO measure_sets (id, name, sha256, is_builtin) VALUES (?, ?, ?, TRUE)",
            [measure_set_id, BUILTIN_MEASURE_SET_NAME, digest],
        )
        conn.executemany(
            """
            INSERT INTO adaptation_measures
                (id, measure_set_id, country, hazard_type, exposure_type,
                 name, cost_factor, hazard_reduction_percentage,
                 description, source_reference, is_builtin, code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    r["code"],
                )
                for r in enriched
            ],
        )
        conn.execute("COMMIT")
    except (duckdb.Error, OSError, ValueError) as exc:
        conn.execute("ROLLBACK")
        raise MeasureSeedError(f"DB insert failed: {exc}") from exc

    _log.info("measures_seeder.done", measure_set_id=measure_set_id, rows=len(enriched))


def run_startup_measures_seed(json_path: Path) -> None:
    """Resolve the production DB, run the seeder, and close the connection.

    Intended as the FastAPI lifespan entry point, called after migrations.
    """
    from backend.db.connection import get_connection, resolve_db_path

    db_path = resolve_db_path()
    conn = get_connection(db_path)
    try:
        seed_builtin_measures(conn, json_path)
    finally:
        conn.close()
