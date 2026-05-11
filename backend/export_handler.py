"""``.riskwise-scenario`` shareable scenario export/import.

Companion to :mod:`workspace_handler` but scoped to a single scenario:
the ZIP carries provenance metadata plus the result blobs, so collaborators
can reproduce a chart side-by-side and audit which versions/seed produced
the numbers. Imported scenarios are flagged ``is_imported = TRUE`` so the
workspace UI can disable the re-run affordance — re-running needs the
original entity/hazard input data, which the ZIP does not bundle.

Layout of the archive::

    provenance.json   – schema-validated metadata (versions, SHAs, seed)
    results/<type>.json – one file per scenario_results row (UTF-8 JSON)
    snapshots/        – stored chart PNGs (file names == ``snapshot_id.png``)
    README.txt        – human-readable summary auto-generated from the row

The wire schema uses the user-facing field names ``hazard`` / ``scenario_type``
even though the DB columns are ``hazard_type`` / ``scenario`` — keeps the
JSON aligned with the documented spec without translation on the consumer side.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import uuid
import zipfile
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.db import (
    ScenarioDetail,
    ScenarioRow,
    get_scenario,
    get_scenario_snapshots_with_image,
    insert_scenario,
)
from backend.logging_config import get_logger
from backend.provenance import REPRODUCIBILITY_NOTE

SCENARIO_EXPORT_VERSION = 1
SCENARIO_ARCHIVE_SUFFIX = ".riskwise-scenario"

PROVENANCE_FILENAME = "provenance.json"
README_FILENAME = "README.txt"
RESULTS_DIR = "results"
SNAPSHOTS_DIR = "snapshots"
# Sidecar manifest carrying per-snapshot metadata (caption, snapshot_type)
# alongside the PNG blobs. Bundles produced before #303 omit it; the import
# path tolerates that and falls back to NULL captions.
SNAPSHOTS_MANIFEST = "snapshots/manifest.json"

# Provenance fields the import path requires. ``computed_at`` is the
# original run's timestamp — preserved so an imported row does not look
# like it ran today.
_REQUIRED_PROVENANCE_FIELDS: tuple[str, ...] = (
    "app_version",
    "engine_version",
    "climada_version",
    "entity_data_sha256",
    "hazard_data_sha256",
    "country_config_sha256",
    "random_seed",
    "computed_at",
    "country",
    "hazard",
    "scenario_type",
)

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

_log = get_logger("scenario.export")


class ScenarioExportError(RuntimeError):
    """Raised when the export source row is missing or unreadable."""


class ScenarioImportError(RuntimeError):
    """Raised when the import ZIP is malformed, incompatible, or unreadable."""


def safe_filename(name: str | None, fallback: str) -> str:
    """Return a filesystem-safe slug usable as the export file basename.

    Spaces and unsafe punctuation are collapsed to a single ``_`` so the
    user-facing filename matches what the workspace shows but never trips
    on the OS picker (Windows refuses ``< > : " / \\ | ? *``).
    """
    if not name:
        return fallback
    safe = _SAFE_FILENAME_RE.sub("_", name).strip("._-")
    return safe or fallback


def _build_provenance_payload(row: ScenarioRow) -> dict[str, Any]:
    return {
        "app_version": row.app_version,
        "engine_version": row.engine_version,
        "climada_version": row.climada_version,
        "entity_data_sha256": row.entity_data_sha256,
        "hazard_data_sha256": row.hazard_data_sha256,
        "country_config_sha256": row.country_config_sha256,
        "random_seed": row.random_seed,
        "computed_at": row.computed_at.isoformat() if row.computed_at else None,
        "country": row.country,
        "hazard": row.hazard_type,
        "scenario_type": row.scenario,
    }


def _build_readme(row: ScenarioRow, snapshot_count: int) -> str:
    title = row.name or row.id
    lines = [
        f"RISK WISE Scenario Export: {title}",
        "=" * (len(title) + 26),
        "",
        f"Scenario ID: {row.id}",
        f"Country: {row.country or '-'}",
        f"Hazard: {row.hazard_type or '-'}",
        f"Climate scenario: {row.scenario or '-'}",
        f"Time horizon: {row.ref_year or '-'} -> {row.future_year or '-'}",
        "",
        f"App version: {row.app_version or '-'}",
        f"Engine version: {row.engine_version or '-'}",
        f"CLIMADA version: {row.climada_version or '-'}",
        f"Random seed: {row.random_seed if row.random_seed is not None else '-'}",
        f"Computed at: {row.computed_at.isoformat() if row.computed_at else '-'}",
        "",
        f"Stored chart snapshots: {snapshot_count}",
        "",
        REPRODUCIBILITY_NOTE,
        "",
        "This bundle is read-only on import. Re-running the scenario "
        "requires the original entity / hazard input data, which is not "
        "included in this archive.",
    ]
    return "\n".join(lines)


def _write_archive(
    output_zip_path: Path,
    detail: ScenarioDetail,
    snapshots: list[dict[str, Any]],
) -> dict[str, Any]:
    provenance = _build_provenance_payload(detail.scenario)
    readme = _build_readme(detail.scenario, snapshot_count=len(snapshots))

    output_zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(PROVENANCE_FILENAME, json.dumps(provenance, indent=2))
        zf.writestr(README_FILENAME, readme)
        for result_type, payload in detail.results.items():
            zf.writestr(f"{RESULTS_DIR}/{result_type}.json", payload)
        manifest_entries: list[dict[str, Any]] = []
        for snap in snapshots:
            image = snap.get("image")
            if image is None:
                continue
            zf.writestr(f"{SNAPSHOTS_DIR}/{snap['id']}.png", image)
            manifest_entries.append(
                {
                    "id": snap["id"],
                    "snapshot_type": snap.get("snapshot_type"),
                    "title": snap.get("title"),
                    "caption": snap.get("caption"),
                }
            )
        if manifest_entries:
            zf.writestr(
                SNAPSHOTS_MANIFEST,
                json.dumps({"snapshots": manifest_entries}, indent=2),
            )
    return provenance


def export_scenario(scenario_id: str, output_zip_path: Path) -> dict[str, Any]:
    """Write a ``.riskwise-scenario`` ZIP for ``scenario_id`` to disk.

    Returns the provenance payload that was embedded so callers (and
    tests) can assert on the wire shape without re-parsing the ZIP.
    """
    detail = get_scenario(scenario_id)
    if detail is None:
        raise ScenarioExportError(f"Scenario not found: {scenario_id}")
    snapshots = get_scenario_snapshots_with_image(scenario_id)
    provenance = _write_archive(output_zip_path, detail, snapshots)
    _log.info(
        "scenario.export",
        scenario_id=scenario_id,
        output=str(output_zip_path),
        snapshot_count=len(snapshots),
    )
    return provenance


def build_export_to_temp(scenario_id: str) -> tuple[Path, str]:
    """Build a scenario export at a fresh tempfile and return ``(path, suggested_filename)``.

    Mirrors :func:`workspace_handler.build_export_to_temp` so the FastAPI
    endpoint can hand the path to the Electron main process, which then
    moves the file to the user-chosen destination and unlinks the source.
    """
    detail = get_scenario(scenario_id)
    if detail is None:
        raise ScenarioExportError(f"Scenario not found: {scenario_id}")

    base = safe_filename(detail.scenario.name, fallback=scenario_id)
    suggested_filename = f"{base}{SCENARIO_ARCHIVE_SUFFIX}"

    tmp_dir = Path(tempfile.mkdtemp(prefix="riskwise-scenario-export-"))
    output = tmp_dir / suggested_filename
    try:
        snapshots = get_scenario_snapshots_with_image(scenario_id)
        _write_archive(output, detail, snapshots)
    except BaseException:
        # Tempdir cleanup must run for every failure mode, including
        # KeyboardInterrupt and worker cancellation, before the error
        # propagates. The original exception is re-raised unchanged so
        # the caller still sees the precise type.
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    return output, suggested_filename


def _validate_provenance(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ScenarioImportError("provenance.json must be a JSON object")
    missing = [k for k in _REQUIRED_PROVENANCE_FIELDS if k not in payload]
    if missing:
        raise ScenarioImportError(f"provenance.json missing fields: {missing}")
    return payload


def _parse_computed_at(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError as exc:
        raise ScenarioImportError(f"computed_at is not a valid ISO timestamp: {value}") from exc


def _read_results_from_zip(zf: zipfile.ZipFile) -> dict[str, bytes]:
    """Pull every ``results/<type>.json`` entry out of the archive."""
    out: dict[str, bytes] = {}
    for entry in zf.infolist():
        if entry.is_dir() or not entry.filename.startswith(f"{RESULTS_DIR}/"):
            continue
        result_type = Path(entry.filename).stem
        out[result_type] = zf.read(entry.filename)
    return out


def _read_snapshots_from_zip(zf: zipfile.ZipFile) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    now = datetime.now(UTC)
    manifest_lookup: dict[str, dict[str, Any]] = {}
    if SNAPSHOTS_MANIFEST in set(zf.namelist()):
        try:
            manifest = json.loads(zf.read(SNAPSHOTS_MANIFEST))
        except json.JSONDecodeError:
            manifest = None
        if isinstance(manifest, dict):
            for entry in manifest.get("snapshots", []) or []:
                if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                    manifest_lookup[entry["id"]] = entry
    for entry in zf.infolist():
        if (
            entry.is_dir()
            or not entry.filename.startswith(f"{SNAPSHOTS_DIR}/")
            or not entry.filename.endswith(".png")
        ):
            continue
        snapshot_id = Path(entry.filename).stem
        meta = manifest_lookup.get(snapshot_id, {})
        snapshots.append(
            {
                "id": snapshot_id,
                "snapshot_type": meta.get("snapshot_type") or "chart",
                "image": zf.read(entry.filename),
                "created_at": now,
                "title": meta.get("title"),
                "caption": meta.get("caption"),
            }
        )
    return snapshots


def import_scenario(zip_path: Path) -> dict[str, Any]:
    """Validate a ``.riskwise-scenario`` ZIP and insert it as a read-only row.

    A fresh UUID4 is minted for every import so two collaborators importing
    the same bundle into different machines don't collide on a guessed id,
    and re-importing the same bundle locally produces a distinct row.
    Returns ``{"scenario_id": ..., "name": ...}``.
    """
    if not zip_path.is_file():
        raise ScenarioImportError(f"Import file not found: {zip_path}")

    try:
        archive = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise ScenarioImportError(f"Not a valid ZIP archive: {zip_path}") from exc

    with archive as zf:
        names = set(zf.namelist())
        if PROVENANCE_FILENAME not in names:
            raise ScenarioImportError(f"Archive is missing {PROVENANCE_FILENAME}")
        results = _read_results_from_zip(zf)
        if not results and not any(n.startswith(f"{RESULTS_DIR}/") for n in names):
            raise ScenarioImportError(f"Archive is missing {RESULTS_DIR}/")

        try:
            provenance_raw = json.loads(zf.read(PROVENANCE_FILENAME))
        except json.JSONDecodeError as exc:
            raise ScenarioImportError("provenance.json is not valid JSON") from exc
        provenance_payload = _validate_provenance(provenance_raw)
        snapshots = _read_snapshots_from_zip(zf)

    scenario_id = str(uuid.uuid4())
    db_provenance = {
        "app_version": str(provenance_payload["app_version"] or ""),
        "engine_version": str(provenance_payload["engine_version"] or ""),
        "climada_version": str(provenance_payload["climada_version"] or ""),
        "entity_data_sha256": str(provenance_payload["entity_data_sha256"] or ""),
        "hazard_data_sha256": str(provenance_payload["hazard_data_sha256"] or ""),
        "country_config_sha256": str(provenance_payload["country_config_sha256"] or ""),
        # Honour the source's config_version when present; only fall back to
        # "imported" when the bundle predates the field, so we don't quietly
        # erase a real version string from the source row.
        "config_version": str(provenance_payload.get("config_version") or "imported"),
        "random_seed": int(provenance_payload["random_seed"] or 0),
    }
    params = {
        "country": provenance_payload.get("country"),
        "hazard_type": provenance_payload.get("hazard"),
        "scenario": provenance_payload.get("scenario_type"),
        "exposure_type": provenance_payload.get("exposure_type"),
        "asset_type": provenance_payload.get("asset_type"),
        "ref_year": provenance_payload.get("ref_year"),
        "future_year": provenance_payload.get("future_year"),
        "annual_growth": provenance_payload.get("annual_growth"),
        "is_era": provenance_payload.get("is_era"),
        "app_option": "imported",
    }
    name = provenance_payload.get("name") or zip_path.stem

    insert_scenario(
        scenario_id,
        params,
        results,
        provenance=db_provenance,
        name=name,
        notes=f"Imported from {zip_path.name}",
        computed_at=_parse_computed_at(provenance_payload.get("computed_at")),
        is_imported=True,
        saved=True,
        snapshots=snapshots,
    )

    _log.info(
        "scenario.import",
        scenario_id=scenario_id,
        source=str(zip_path),
        snapshot_count=len(snapshots),
    )
    return {"scenario_id": scenario_id, "name": name}


def export_provenance_payload(scenario_id: str) -> dict[str, Any]:
    """Return the provenance.json payload for a saved scenario without writing."""
    detail = get_scenario(scenario_id)
    if detail is None:
        raise ScenarioExportError(f"Scenario not found: {scenario_id}")
    return _build_provenance_payload(detail.scenario)


def scenario_row_summary(scenario_id: str) -> dict[str, Any]:
    """Return scenario metadata as a dict (used by tests + Electron preview)."""
    detail = get_scenario(scenario_id)
    if detail is None:
        raise ScenarioExportError(f"Scenario not found: {scenario_id}")
    return asdict(detail.scenario)
