"""Import, list, and delete user-supplied adaptation measure sets.

The xlsx the renderer hands us is validated column-by-column, copied under
``<user-data>/measures/<id>.xlsx`` so the dataset survives moves of the
original file, and inserted atomically into ``measure_sets`` +
``adaptation_measures``. The built-in seeder (``measures_seeder``) uses a
different xlsx shape that CLIMADA ships with — this handler takes the
richer, user-facing schema called out in issue #92 so that custom sets can
carry descriptive fields the built-in file lacks.
"""

from __future__ import annotations

import math
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

import duckdb
import pandas as pd
from constants import USER_DATA_DIR
from logging_config import get_logger
from provenance import sha256_file

_log = get_logger("measures.measure_dataset_handler")

MEASURES_SHEET_NAME = "measures"
MEASURES_SUBDIR = "measures"

REQUIRED_COLUMNS: frozenset[str] = frozenset(
    {
        "measure_id",
        "country",
        "hazard_type",
        "exposure_type",
        "name",
        "cost_factor",
        "hazard_reduction_percentage",
        "description",
        "source_reference",
    }
)


class MeasureDatasetError(RuntimeError):
    """Raised when an upload/delete cannot proceed (validation failure)."""


class MeasureDatasetNotFound(MeasureDatasetError):
    """Raised when the referenced dataset id does not exist."""


class MeasureDatasetProtected(MeasureDatasetError):
    """Raised when the caller tries to delete a built-in measure set."""


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]
    df: pd.DataFrame | None = None


def get_measure_datasets_dir() -> Path:
    """Return the directory where user-uploaded measure xlsx files are stored."""
    return USER_DATA_DIR / MEASURES_SUBDIR


def _expected_columns_message() -> str:
    return "Expected columns: " + ", ".join(sorted(REQUIRED_COLUMNS))


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        fv = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(fv):
        return None
    return fv


def _as_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def validate_xlsx_schema(xlsx_path: Path) -> ValidationResult:
    """Inspect an xlsx without touching the DB.

    Collects every problem (missing sheet, missing columns, invalid values,
    duplicate measure_id) in one pass so the panel can render them as a
    single inline error list rather than drip-feeding one error per retry.
    """
    errors: list[str] = []
    try:
        sheets = pd.read_excel(xlsx_path, sheet_name=None)
    except FileNotFoundError:
        return ValidationResult(False, [f"File not found: {xlsx_path}"])
    except Exception as exc:
        return ValidationResult(False, [f"Cannot open '{xlsx_path.name}': {exc}"])

    if MEASURES_SHEET_NAME not in sheets:
        return ValidationResult(
            False,
            [
                f"Missing sheet '{MEASURES_SHEET_NAME}'. "
                f"Found sheets: {', '.join(sheets) or '(none)'}."
            ],
        )
    df = sheets[MEASURES_SHEET_NAME]

    missing = REQUIRED_COLUMNS - set(df.columns)
    for col in sorted(missing):
        errors.append(
            f"Missing column '{col}' in sheet '{MEASURES_SHEET_NAME}'. "
            f"{_expected_columns_message()}"
        )
    if errors:
        return ValidationResult(False, errors)

    if df.empty:
        return ValidationResult(False, [f"Sheet '{MEASURES_SHEET_NAME}' has no data rows."])

    seen: set[tuple[str, str, str, str]] = set()
    for i, row in enumerate(df.to_dict(orient="records")):
        errors.extend(_validate_row(row, i, seen))
        if len(errors) >= 20:
            errors.append("… further errors suppressed.")
            break

    return ValidationResult(not errors, errors, df if not errors else None)


def _validate_row(row: dict, row_index: int, seen: set[tuple[str, str, str, str]]) -> list[str]:
    errors: list[str] = []

    measure_id = _as_str(row.get("measure_id"))
    if not measure_id:
        errors.append(f"Row {row_index}: 'measure_id' is required.")

    name = _as_str(row.get("name"))
    if not name:
        errors.append(f"Row {row_index}: 'name' is required.")

    country = _as_str(row.get("country"))
    hazard_type = _as_str(row.get("hazard_type"))
    exposure_type = _as_str(row.get("exposure_type"))
    if not hazard_type:
        errors.append(f"Row {row_index}: 'hazard_type' is required.")

    cost = _as_float(row.get("cost_factor"))
    if cost is None:
        errors.append(
            f"Row {row_index}: 'cost_factor' must be numeric, got {row.get('cost_factor')!r}."
        )
    elif cost <= 0:
        errors.append(f"Row {row_index}: 'cost_factor' must be > 0, got {cost}.")

    hrp = _as_float(row.get("hazard_reduction_percentage"))
    if hrp is None:
        errors.append(
            f"Row {row_index}: 'hazard_reduction_percentage' must be numeric, got "
            f"{row.get('hazard_reduction_percentage')!r}."
        )
    elif not 0.0 <= hrp <= 100.0:
        errors.append(
            f"Row {row_index}: 'hazard_reduction_percentage' must be in [0, 100], got {hrp}."
        )

    if measure_id and hazard_type:
        key = (measure_id, country, hazard_type, exposure_type)
        if key in seen:
            errors.append(
                f"Row {row_index}: duplicate measure_id {measure_id!r} within "
                f"(country={country or '—'}, hazard_type={hazard_type}, "
                f"exposure_type={exposure_type or '—'})."
            )
        else:
            seen.add(key)

    return errors


def import_dataset(
    name: str,
    xlsx_path: Path,
    conn: duckdb.DuckDBPyConnection | None = None,
) -> dict:
    """Validate *xlsx_path*, copy it into user-data, and insert DB rows.

    Returns the metadata row shape consumed by :mod:`db.measures_store`.
    """
    if not name or not name.strip():
        raise MeasureDatasetError("Dataset name is required.")
    name = name.strip()

    result = validate_xlsx_schema(xlsx_path)
    if not result.valid or result.df is None:
        raise MeasureDatasetError("; ".join(result.errors))
    df = result.df

    owns_conn = conn is None
    if conn is None:
        from db.connection import get_connection

        conn = get_connection()

    try:
        sha = sha256_file(xlsx_path)
        measure_set_id = str(uuid.uuid4())

        target_dir = get_measure_datasets_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{measure_set_id}.xlsx"
        shutil.copy2(xlsx_path, target_path)

        rows = df.to_dict(orient="records")

        conn.execute("BEGIN TRANSACTION")
        try:
            conn.execute(
                """
                INSERT INTO measure_sets (id, name, sha256, is_builtin)
                VALUES (?, ?, ?, FALSE)
                """,
                [measure_set_id, name, sha],
            )
            conn.executemany(
                """
                INSERT INTO adaptation_measures
                    (id, measure_set_id, country, hazard_type, exposure_type,
                     name, cost_factor, hazard_reduction_percentage,
                     description, source_reference, is_builtin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
                """,
                [
                    (
                        str(uuid.uuid4()),
                        measure_set_id,
                        _as_str(r.get("country")) or None,
                        _as_str(r.get("hazard_type")),
                        _as_str(r.get("exposure_type")) or None,
                        _as_str(r.get("name")),
                        float(r["cost_factor"]),
                        float(r["hazard_reduction_percentage"]),
                        _as_str(r.get("description")) or None,
                        _as_str(r.get("source_reference")),
                    )
                    for r in rows
                ],
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            # Remove the stored copy so a failed insert never leaves an
            # orphan file behind; the table is the source of truth.
            target_path.unlink(missing_ok=True)
            raise

        from db.measures_store import list_measure_sets

        all_sets = list_measure_sets(conn=conn)
        metadata = next((s for s in all_sets if s["id"] == measure_set_id), None)
        if metadata is None:
            raise MeasureDatasetError("Measure set was inserted but could not be read back.")
        _log.info(
            "measure_dataset.imported",
            measure_set_id=measure_set_id,
            rows=len(rows),
            sha256=sha[:12],
        )
        return metadata
    finally:
        if owns_conn:
            conn.close()


def delete_dataset(
    measure_set_id: str,
    conn: duckdb.DuckDBPyConnection | None = None,
) -> None:
    """Remove a custom measure set. Raises if the id is built-in or unknown."""
    owns_conn = conn is None
    if conn is None:
        from db.connection import get_connection

        conn = get_connection()
    try:
        row = conn.execute(
            "SELECT is_builtin FROM measure_sets WHERE id = ?",
            [measure_set_id],
        ).fetchone()
        if row is None:
            raise MeasureDatasetNotFound(f"Measure set {measure_set_id!r} not found.")
        (is_builtin,) = row
        if is_builtin:
            raise MeasureDatasetProtected("The built-in adaptation measure set cannot be deleted.")

        conn.execute("BEGIN TRANSACTION")
        try:
            conn.execute(
                "DELETE FROM adaptation_measures WHERE measure_set_id = ?",
                [measure_set_id],
            )
            conn.execute("DELETE FROM measure_sets WHERE id = ?", [measure_set_id])
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

        # Best-effort: unlink the stored xlsx copy. We only touch paths that
        # live under the user-data measures dir so a stray ``source`` could
        # never reach into the project tree.
        stored = get_measure_datasets_dir() / f"{measure_set_id}.xlsx"
        try:
            stored_dir = get_measure_datasets_dir().resolve()
            if stored.resolve().is_relative_to(stored_dir):
                stored.unlink(missing_ok=True)
        except OSError:
            pass

        _log.info("measure_dataset.deleted", measure_set_id=measure_set_id)
    finally:
        if owns_conn:
            conn.close()
