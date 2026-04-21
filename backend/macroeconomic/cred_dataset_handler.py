"""Import, list, and delete user-supplied CRED datasets.

``import_dataset`` copies the xlsx under ``<user-data>/cred/<id>.xlsx`` so
the dataset survives moves of the original file; metadata + flattened rows
are inserted atomically. Built-in seeding lives in
:mod:`macroeconomic.cred_seeder`; both paths share :data:`REQUIRED_COLUMNS`.
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
from macroeconomic.cred_seeder import REQUIRED_COLUMNS
from provenance import sha256_file

_log = get_logger("macroeconomic.cred_dataset_handler")

CRED_SHEET_NAME = "cred_output"
CRED_DATASETS_SUBDIR = "cred"


class CredDatasetError(RuntimeError):
    """Raised when an upload/delete cannot proceed (validation failure)."""


class CredDatasetNotFound(CredDatasetError):
    """Raised when the referenced dataset id does not exist."""


class CredDatasetProtected(CredDatasetError):
    """Raised when the caller tries to delete a built-in dataset."""


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]
    df: pd.DataFrame | None = None


def get_cred_datasets_dir() -> Path:
    """Return the directory where user-uploaded CRED xlsx files are stored."""
    return USER_DATA_DIR / CRED_DATASETS_SUBDIR


def _expected_columns_message() -> str:
    return "Expected columns: " + ", ".join(sorted(REQUIRED_COLUMNS))


def validate_xlsx_schema(xlsx_path: Path) -> ValidationResult:
    """Inspect an xlsx without touching the DB.

    Surfaces every problem in one pass (missing sheet, missing columns, non-
    numeric year/value) so the renderer can render them as a single toast +
    inline error list rather than forcing the user through one-at-a-time
    error popups.
    """
    errors: list[str] = []
    try:
        sheets = pd.read_excel(xlsx_path, sheet_name=None)
    except FileNotFoundError:
        return ValidationResult(False, [f"File not found: {xlsx_path}"])
    except Exception as exc:
        return ValidationResult(False, [f"Cannot open '{xlsx_path.name}': {exc}"])

    if CRED_SHEET_NAME not in sheets:
        return ValidationResult(
            False,
            [f"Missing sheet '{CRED_SHEET_NAME}'. Found sheets: {', '.join(sheets) or '(none)'}."],
        )
    df = sheets[CRED_SHEET_NAME]

    missing = REQUIRED_COLUMNS - set(df.columns)
    for col in sorted(missing):
        errors.append(
            f"Missing column '{col}' in sheet '{CRED_SHEET_NAME}'. {_expected_columns_message()}"
        )
    if errors:
        return ValidationResult(False, errors)

    if df.empty:
        return ValidationResult(False, [f"Sheet '{CRED_SHEET_NAME}' has no data rows."])

    for i, row in enumerate(df.to_dict(orient="records")):
        row_errors = _validate_row(row, i)
        errors.extend(row_errors)
        if len(errors) >= 20:
            errors.append("… further errors suppressed.")
            break

    return ValidationResult(not errors, errors, df if not errors else None)


def _validate_row(row: dict, row_index: int) -> list[str]:
    errors: list[str] = []
    try:
        int(row["year"])
    except (TypeError, ValueError):
        errors.append(f"Row {row_index}: 'year' must be an integer, got {row['year']!r}.")
    v = row["proportion_change_from_baseline"]
    if v is None:
        return errors
    try:
        fv = float(v)
        if math.isnan(fv):
            raise ValueError("NaN")
    except (TypeError, ValueError):
        errors.append(
            f"Row {row_index}: 'proportion_change_from_baseline' must be numeric, got {v!r}."
        )
    return errors


def import_dataset(
    name: str,
    xlsx_path: Path,
    conn: duckdb.DuckDBPyConnection | None = None,
) -> dict:
    """Validate *xlsx_path*, copy it into user-data, and insert DB rows.

    Returns the metadata row shape consumed by :mod:`db.cred_store`.
    """
    if not name or not name.strip():
        raise CredDatasetError("Dataset name is required.")
    name = name.strip()

    result = validate_xlsx_schema(xlsx_path)
    if not result.valid or result.df is None:
        raise CredDatasetError("; ".join(result.errors))
    df = result.df

    owns_conn = conn is None
    if conn is None:
        from db.connection import get_connection

        conn = get_connection()

    try:
        sha = sha256_file(xlsx_path)
        dataset_id = str(uuid.uuid4())

        target_dir = get_cred_datasets_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{dataset_id}.xlsx"
        shutil.copy2(xlsx_path, target_path)

        rows = df.to_dict(orient="records")

        conn.execute("BEGIN TRANSACTION")
        try:
            conn.execute(
                """
                INSERT INTO cred_datasets (id, name, source, sha256, is_builtin)
                VALUES (?, ?, ?, ?, FALSE)
                """,
                [dataset_id, name, str(target_path), sha],
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
        except Exception:
            conn.execute("ROLLBACK")
            # Remove the stored copy so a failed insert never leaves an orphan
            # file behind; the table is the source of truth.
            target_path.unlink(missing_ok=True)
            raise

        row = conn.execute(
            "SELECT id, name, source, uploaded_at, is_builtin, sha256 "
            "FROM cred_datasets WHERE id = ?",
            [dataset_id],
        ).fetchone()
        cols = ["id", "name", "source", "uploaded_at", "is_builtin", "sha256"]
        metadata = dict(zip(cols, row, strict=True))
        _log.info(
            "cred_dataset.imported",
            dataset_id=dataset_id,
            rows=len(rows),
            sha256=sha[:12],
        )
        return metadata
    finally:
        if owns_conn:
            conn.close()


def delete_dataset(
    dataset_id: str,
    conn: duckdb.DuckDBPyConnection | None = None,
) -> None:
    """Remove a custom dataset. Raises if the id is built-in or unknown."""
    owns_conn = conn is None
    if conn is None:
        from db.connection import get_connection

        conn = get_connection()
    try:
        row = conn.execute(
            "SELECT is_builtin, source FROM cred_datasets WHERE id = ?",
            [dataset_id],
        ).fetchone()
        if row is None:
            raise CredDatasetNotFound(f"Dataset {dataset_id!r} not found.")
        is_builtin, source = row
        if is_builtin:
            raise CredDatasetProtected("The built-in CRED dataset cannot be deleted.")

        conn.execute("BEGIN TRANSACTION")
        try:
            conn.execute("DELETE FROM cred_data WHERE dataset_id = ?", [dataset_id])
            conn.execute("DELETE FROM cred_datasets WHERE id = ?", [dataset_id])
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

        if source:
            # Only unlink paths that live under the user-data cred dir; this
            # prevents a malformed ``source`` (e.g. the built-in's repo path
            # if someone mis-flags a row) from reaching into the project tree.
            try:
                target = Path(source)
                cred_dir = get_cred_datasets_dir().resolve()
                if target.resolve().is_relative_to(cred_dir):
                    target.unlink(missing_ok=True)
            except OSError:
                pass

        _log.info("cred_dataset.deleted", dataset_id=dataset_id)
    finally:
        if owns_conn:
            conn.close()
