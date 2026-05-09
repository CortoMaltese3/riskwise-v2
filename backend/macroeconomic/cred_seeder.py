"""Seed the built-in CRED dataset into DuckDB on first launch.

The seeder is idempotent: it computes the SHA-256 of the source xlsx and
skips the insert if a matching built-in row already exists. Any validation
failure raises :class:`CredSeedError` with a structured message naming the
offending row — callers are expected to treat this as a fatal startup error.
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

_log = get_logger("macroeconomic.cred_seeder")


CRED_COLUMNS = [
    "country",
    "scenario",
    "adaptation",
    "economic_indicator",
    "economic_sector",
    "year",
    "proportion_change_from_baseline",
]
REQUIRED_COLUMNS: set[str] = set(CRED_COLUMNS)

BUILTIN_DATASET_NAME = "Built-in CRED v2024"


class CredSeedError(RuntimeError):
    """Raised when xlsx validation fails during the built-in migration."""


def _validate_row(row: dict[str, Any], row_index: int) -> None:
    """Raise CredSeedError if the row fails structural validation."""
    for col in REQUIRED_COLUMNS:
        if col not in row or (row[col] is None and col != "adaptation"):
            raise CredSeedError(
                f"Row {row_index}: missing required column '{col}' — found {list(row.keys())}"
            )
    try:
        int(row["year"])
    except (TypeError, ValueError):
        raise CredSeedError(f"Row {row_index}: 'year' must be an integer, got {row['year']!r}")
    v = row["proportion_change_from_baseline"]
    try:
        fv = float(v) if v is not None else None
        if fv is not None and math.isnan(fv):
            raise ValueError("NaN")
    except (TypeError, ValueError):
        raise CredSeedError(
            f"Row {row_index}: 'proportion_change_from_baseline' must be numeric, "
            f"got {row['proportion_change_from_baseline']!r}"
        )


def seed_builtin_cred(conn: duckdb.DuckDBPyConnection, xlsx_path: Path) -> None:
    """Insert the built-in CRED dataset unless it is already present.

    Uses the xlsx SHA-256 as the idempotency key so a re-packaged xlsx
    (same path, changed content) will re-seed rather than silently serving
    stale data.
    """
    try:
        sha = sha256_file(xlsx_path)
    except OSError as exc:
        raise CredSeedError(f"Cannot open '{xlsx_path}': {exc}") from exc

    existing = conn.execute(
        "SELECT id FROM cred_datasets WHERE is_builtin = TRUE AND sha256 = ?",
        [sha],
    ).fetchone()
    if existing:
        _log.info("cred_seeder.skip", reason="already_seeded", sha256=sha[:12])
        return

    _log.info("cred_seeder.start", xlsx=str(xlsx_path), sha256=sha[:12])

    try:
        df = pd.read_excel(xlsx_path, sheet_name="cred_output")
    except (OSError, ValueError, ImportError) as exc:
        raise CredSeedError(f"Cannot open '{xlsx_path}': {exc}") from exc

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise CredSeedError(f"xlsx is missing required columns: {sorted(missing)}")

    dataset_id = str(uuid.uuid4())
    rows = df.to_dict(orient="records")

    for i, row in enumerate(rows):
        _validate_row(row, i)

    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(
            """
            INSERT INTO cred_datasets (id, name, source, sha256, is_builtin)
            VALUES (?, ?, ?, ?, TRUE)
            """,
            [dataset_id, BUILTIN_DATASET_NAME, str(xlsx_path), sha],
        )

        conn.executemany(
            """
            INSERT INTO cred_data
                (id, dataset_id, country, scenario, adaptation,
                 variable, sector, year, value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(uuid.uuid4()),
                    dataset_id,
                    str(r["country"]),
                    str(r["scenario"]),
                    r["adaptation"] if r["adaptation"] is not None else None,
                    str(r["economic_indicator"]),
                    str(r["economic_sector"]),
                    int(r["year"]),
                    float(r["proportion_change_from_baseline"])
                    if r["proportion_change_from_baseline"] is not None
                    else None,
                )
                for r in rows
            ],
        )
        conn.execute("COMMIT")
    except (duckdb.Error, OSError, ValueError) as exc:
        conn.execute("ROLLBACK")
        raise CredSeedError(f"DB insert failed: {exc}") from exc

    _log.info("cred_seeder.done", dataset_id=dataset_id, rows=len(rows))


def run_startup_cred_seed(xlsx_path: Path) -> None:
    """Resolve the production DB, run the seeder, and close the connection.

    Intended as the FastAPI lifespan entry point, called after migrations.
    """
    from backend.db.connection import get_connection, resolve_db_path

    db_path = resolve_db_path()
    conn = get_connection(db_path)
    try:
        seed_builtin_cred(conn, xlsx_path)
    finally:
        conn.close()
