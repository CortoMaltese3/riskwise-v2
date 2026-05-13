"""Workspace ZIP export/import for air-gapped machine migration (issue #82).

The export bundles the current DuckDB file (``riskwise.db``) plus a
``manifest.json`` into a ``.riskwise-workspace`` archive. The import
reverses it: validate the manifest, ATTACH the embedded DB read-only,
and copy scenarios (plus their results and snapshots) into the current
DB, skipping any id that already exists.

Both paths own their own DuckDB connection life-cycle — callers pass
file paths, not open connections — so this module can be driven from
the FastAPI event loop (via ``asyncio.to_thread``) without blocking it
on DuckDB's synchronous IO.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from backend.db.connection import DB_FILE_NAME, get_connection, resolve_db_path
from backend.logging_config import get_logger
from backend.provenance import app_version

WORKSPACE_EXPORT_VERSION = 1
MANIFEST_FILENAME = "manifest.json"
WORKSPACE_ARCHIVE_SUFFIX = ".riskwise-workspace"

_log = get_logger("workspace")


class WorkspaceImportError(RuntimeError):
    """Raised when an import ZIP is malformed, incompatible, or unreadable."""


def _current_schema_version(db_path: Path | None = None) -> int:
    conn = get_connection(db_path) if db_path is not None else get_connection()
    try:
        row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_version").fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    finally:
        conn.close()


def _scenario_count(db_path: Path | None = None) -> int:
    conn = get_connection(db_path) if db_path is not None else get_connection()
    try:
        row = conn.execute("SELECT COUNT(*) FROM scenarios").fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def export_workspace(output_zip_path: Path) -> dict[str, object]:
    """Write a ``.riskwise-workspace`` ZIP to ``output_zip_path``.

    Runs ``CHECKPOINT`` first so the on-disk DuckDB file contains every
    committed row (no write-ahead log left straggling). Returns the manifest
    dict so callers can log or echo it without parsing the ZIP again.
    """
    db_path = resolve_db_path()
    if not db_path.is_file():
        raise WorkspaceImportError(f"Workspace DB not found at {db_path}")

    conn = get_connection(db_path)
    try:
        conn.execute("CHECKPOINT")
    finally:
        conn.close()

    scenario_count = _scenario_count(db_path)
    manifest = {
        "version": WORKSPACE_EXPORT_VERSION,
        "export_date": datetime.now(UTC).isoformat(timespec="seconds"),
        "scenario_count": scenario_count,
        "app_version": app_version(),
        "schema_version": _current_schema_version(db_path),
    }

    output_zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFEST_FILENAME, json.dumps(manifest, indent=2))
        zf.write(db_path, arcname=DB_FILE_NAME)

    _log.info(
        "workspace.export",
        output=str(output_zip_path),
        scenario_count=scenario_count,
    )
    return manifest


def import_workspace(zip_path: Path) -> dict[str, int]:
    """Merge scenarios from a ``.riskwise-workspace`` ZIP into the current DB.

    Returns ``{"imported_count": N, "skipped_count": M}``. Scenarios whose
    id already exists in the current DB are skipped — the spec treats id
    collisions as "same scenario, already present" and prefers preserving
    the local copy over silently duplicating rows under a new UUID.
    """
    if not zip_path.is_file():
        raise WorkspaceImportError(f"Import file not found: {zip_path}")

    try:
        archive = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise WorkspaceImportError(f"Not a valid ZIP archive: {zip_path}") from exc

    with archive as zf:
        names = set(zf.namelist())
        if MANIFEST_FILENAME not in names:
            raise WorkspaceImportError("Archive is missing manifest.json")
        if DB_FILE_NAME not in names:
            raise WorkspaceImportError(f"Archive is missing {DB_FILE_NAME}")

        try:
            manifest = json.loads(zf.read(MANIFEST_FILENAME))
        except json.JSONDecodeError as exc:
            raise WorkspaceImportError("manifest.json is not valid JSON") from exc

        if manifest.get("version") != WORKSPACE_EXPORT_VERSION:
            raise WorkspaceImportError(
                f"Unsupported workspace version {manifest.get('version')!r}; "
                f"expected {WORKSPACE_EXPORT_VERSION}"
            )

        current_schema = _current_schema_version()
        archive_schema = manifest.get("schema_version")
        if archive_schema != current_schema:
            raise WorkspaceImportError(
                f"Incompatible schema version: archive is {archive_schema}, "
                f"this install is {current_schema}"
            )

        with tempfile.TemporaryDirectory() as tmp_dir:
            zf.extract(DB_FILE_NAME, tmp_dir)
            imported_db = Path(tmp_dir) / DB_FILE_NAME
            counts = _merge_scenarios(imported_db)

    _log.info(
        "workspace.import",
        source=str(zip_path),
        imported=counts["imported_count"],
        skipped=counts["skipped_count"],
    )
    return counts


def _merge_scenarios(imported_db: Path) -> dict[str, int]:
    """ATTACH the imported DB read-only and copy new rows into the live DB."""
    conn = get_connection()
    try:
        # ATTACH ... (READ_ONLY) exposes the imported DB as a second schema
        # so we can SELECT from it without holding two separate connections.
        conn.execute(f"ATTACH '{imported_db.as_posix()}' AS imported (READ_ONLY)")
        try:
            imported_ids = [
                row[0] for row in conn.execute("SELECT id FROM imported.scenarios").fetchall()
            ]
            existing_ids = {row[0] for row in conn.execute("SELECT id FROM scenarios").fetchall()}
            to_insert = [sid for sid in imported_ids if sid not in existing_ids]
            skipped = len(imported_ids) - len(to_insert)

            if to_insert:
                placeholders = ",".join(["?"] * len(to_insert))
                conn.execute("BEGIN TRANSACTION")
                try:
                    conn.execute(
                        f"INSERT INTO scenarios "
                        f"SELECT * FROM imported.scenarios WHERE id IN ({placeholders})",
                        to_insert,
                    )
                    conn.execute(
                        f"INSERT INTO scenario_results "
                        f"SELECT * FROM imported.scenario_results "
                        f"WHERE scenario_id IN ({placeholders})",
                        to_insert,
                    )
                    conn.execute(
                        f"INSERT INTO snapshots "
                        f"SELECT * FROM imported.snapshots "
                        f"WHERE scenario_id IN ({placeholders})",
                        to_insert,
                    )
                    conn.execute("COMMIT")
                except duckdb.Error:
                    conn.execute("ROLLBACK")
                    raise
        finally:
            conn.execute("DETACH imported")
            # CHECKPOINT flushes ATTACH/DETACH (and INSERT) records out of
            # the WAL. Without it, DuckDB's next-startup WAL replay can hit
            # the now-deleted temp DB path and abort with
            # ``DatabaseManager::GetDefaultDatabase with no default database set``.
            conn.execute("CHECKPOINT")
    finally:
        conn.close()

    return {"imported_count": len(to_insert), "skipped_count": skipped}


def build_export_to_temp() -> tuple[Path, dict[str, object]]:
    """Create a workspace export at a fresh tempfile and return its path.

    Used by the FastAPI endpoint so the Electron main process can pick the
    file up, copy it to the user-chosen destination, and unlink the temp
    copy afterwards.
    """
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    tmp_dir = Path(tempfile.mkdtemp(prefix="riskwise-export-"))
    output = tmp_dir / f"riskwise-workspace-{stamp}{WORKSPACE_ARCHIVE_SUFFIX}"
    try:
        manifest = export_workspace(output)
    except BaseException:
        # Tempdir cleanup runs for every failure including worker
        # cancellation; the original exception is re-raised unchanged.
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    return output, manifest
