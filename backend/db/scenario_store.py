"""DuckDB-backed persistence for scenario workspace state.

The scenario store is the sole writer to ``scenarios``, ``scenario_results``,
and ``snapshots`` from the v2 workspace flow. Every call opens a fresh
connection so this module is safe to call from the scenario runner thread
and the FastAPI event loop — DuckDB connections are not shared across
threads.

Result blobs are stored as raw UTF-8 bytes (JSON content) so readers can
return them verbatim without an extra decode step. The blob-agnostic
``BLOB`` column type mirrors the schema in ``0001_initial.sql``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.db.connection import get_connection


class ScenarioNotFound(LookupError):
    """Raised when an operation targets a scenario id that does not exist."""


# Provenance keys whose value cannot be ``None`` on a fresh insert. The
# dual-backend split (#162) made ``engine_version`` and ``climada_version``
# nullable: exactly one is populated based on the backend that produced
# the row, so they are deliberately not in this required set.
_PROVENANCE_FIELDS: tuple[str, ...] = (
    "app_version",
    "entity_data_sha256",
    "hazard_data_sha256",
    "country_config_sha256",
    "config_version",
    "random_seed",
)

RESULT_TYPES = (
    "hazard_geojson",
    "exposure_geojson",
    "impact_geojson",
    "waterfall_data",
    "costben_data",
    "impact_summary",
)


@dataclass
class ScenarioRow:
    """One row from ``scenarios`` as the list endpoint exposes it."""

    id: str
    name: str | None
    tags: str | None
    notes: str | None
    country: str | None
    hazard_type: str | None
    scenario: str | None
    exposure_type: str | None
    asset_type: str | None
    ref_year: int | None
    future_year: int | None
    annual_growth: float | None
    is_era: bool | None
    app_option: str | None
    status: str | None
    created_at: datetime | None
    # Provenance fields surfaced for the print view, Excel sheet, and
    # the .riskwise-scenario export so all three read from one source.
    app_version: str | None = None
    engine: str | None = None
    engine_version: str | None = None
    climada_version: str | None = None
    entity_data_sha256: str | None = None
    hazard_data_sha256: str | None = None
    country_config_sha256: str | None = None
    random_seed: int | None = None
    computed_at: datetime | None = None
    is_imported: bool = False
    saved: bool = False


@dataclass
class ScenarioDetail:
    """A scenario row plus its keyed ``scenario_results`` payloads."""

    scenario: ScenarioRow
    results: dict[str, str] = field(default_factory=dict)


def insert_scenario(
    scenario_id: str,
    params: dict[str, Any],
    results: dict[str, bytes],
    *,
    provenance: dict[str, Any],
    name: str | None = None,
    tags: str | None = None,
    notes: str | None = None,
    status: str = "completed",
    computed_at: datetime | None = None,
    is_imported: bool = False,
    saved: bool = False,
    snapshots: list[dict[str, Any]] | None = None,
) -> None:
    """Persist a finished run: one ``scenarios`` row + N result blobs (+ optional snapshots).

    ``provenance`` is mandatory: every scenario row must carry a complete
    set of reproducibility fields (see migration ``0002_provenance.sql``).
    A missing field is a handler-level error — the DB would also reject
    the insert via its NOT NULL constraint, but raising here gives the
    caller a clearer traceback pointing at the offending key.

    Two modes share this writer. The default (``is_imported=False``,
    ``computed_at=None``, ``snapshots=None``) is the fresh-run path used
    by the scenario runner. The ``.riskwise-scenario`` import path passes
    ``is_imported=True`` plus the original ``computed_at`` (so the row
    keeps its original timestamp instead of "now") and a list of snapshot
    dicts to embed verbatim.

    ``saved=False`` hides the row from :func:`list_scenarios` until
    :func:`update_scenario_metadata` flips it; the import path passes
    ``saved=True`` so imported bundles appear in the workspace immediately.
    """
    missing = [f for f in _PROVENANCE_FIELDS if provenance.get(f) is None]
    if missing:
        raise ValueError(f"insert_scenario: missing provenance fields: {missing}")

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO scenarios (
                id, name, tags, notes, country, hazard_type, scenario,
                exposure_type, asset_type, ref_year,
                future_year, annual_growth, is_era, app_option, status,
                app_version, engine, engine_version, climada_version,
                entity_data_sha256, hazard_data_sha256, country_config_sha256,
                config_version, random_seed, computed_at, is_imported, saved
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)
            """,
            [
                scenario_id,
                name,
                tags,
                notes,
                params.get("country"),
                params.get("hazard_type"),
                params.get("scenario"),
                params.get("exposure_type"),
                params.get("asset_type"),
                params.get("ref_year"),
                params.get("future_year"),
                params.get("annual_growth"),
                params.get("is_era"),
                params.get("app_option"),
                status,
                provenance["app_version"],
                provenance.get("engine"),
                provenance.get("engine_version"),
                provenance.get("climada_version"),
                provenance["entity_data_sha256"],
                provenance["hazard_data_sha256"],
                provenance["country_config_sha256"],
                provenance["config_version"],
                provenance["random_seed"],
                computed_at,
                is_imported,
                saved,
            ],
        )
        for result_type, blob in results.items():
            if result_type not in RESULT_TYPES:
                raise ValueError(f"Unknown result_type: {result_type}")
            conn.execute(
                """
                INSERT INTO scenario_results (id, scenario_id, result_type, data)
                VALUES (?, ?, ?, ?)
                """,
                [f"{scenario_id}:{result_type}", scenario_id, result_type, blob],
            )
        if snapshots:
            for snap in snapshots:
                conn.execute(
                    """
                    INSERT INTO snapshots
                        (id, scenario_id, snapshot_type, image, created_at, title, caption)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        snap["id"],
                        scenario_id,
                        snap["snapshot_type"],
                        snap.get("image"),
                        snap.get("created_at"),
                        snap.get("title"),
                        snap.get("caption"),
                    ],
                )
    finally:
        conn.close()


def get_scenario_snapshots_with_image(scenario_id: str) -> list[dict[str, Any]]:
    """Return every snapshot for a scenario including the image bytes.

    The list endpoint :func:`list_snapshots` deliberately omits the image
    blob (cheap metadata for the drawer); the export path needs the bytes
    to embed into the ``.riskwise-scenario`` ZIP.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, scenario_id, snapshot_type, image, created_at, title, caption
            FROM snapshots WHERE scenario_id = ?
            ORDER BY created_at ASC
            """,
            [scenario_id],
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "id": r[0],
            "scenario_id": r[1],
            "snapshot_type": r[2],
            "image": bytes(r[3]) if r[3] is not None else None,
            "created_at": r[4],
            "title": r[5],
            "caption": r[6],
        }
        for r in rows
    ]


def patch_scenario_metadata(
    scenario_id: str,
    *,
    name: str | None = None,
    tags: str | None = None,
    notes: str | None = None,
) -> ScenarioRow | None:
    """Partial update: only fields passed as non-None are written.

    Unlike :func:`update_scenario_metadata`, ``None`` means "leave as-is".
    Used by ``PATCH /api/v1/scenarios/{id}`` for inline rename and
    tag/note edits where the client sends only the changed field.
    """
    updates: list[str] = []
    values: list[Any] = []
    if name is not None:
        updates.append("name = ?")
        values.append(name)
    if tags is not None:
        updates.append("tags = ?")
        values.append(tags)
    if notes is not None:
        updates.append("notes = ?")
        values.append(notes)
    if not updates:
        detail = get_scenario(scenario_id)
        return detail.scenario if detail else None
    values.append(scenario_id)
    conn = get_connection()
    try:
        row = conn.execute(
            f"""
            UPDATE scenarios SET {", ".join(updates)} WHERE id = ?
            RETURNING {_SCENARIO_SELECT_COLUMNS}
            """,
            values,
        ).fetchone()
    finally:
        conn.close()
    return _row_to_scenario(row) if row is not None else None


def update_scenario_metadata(
    scenario_id: str,
    *,
    name: str | None,
    tags: str | None,
    notes: str | None,
) -> ScenarioRow | None:
    """Overwrite the user-facing metadata on a saved scenario.

    Returns the updated row, or ``None`` if the id is unknown. The row is
    read back via ``UPDATE ... RETURNING`` so callers don't need a follow-up
    SELECT just to echo the saved values.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            f"""
            UPDATE scenarios SET name = ?, tags = ?, notes = ?, saved = TRUE WHERE id = ?
            RETURNING {_SCENARIO_SELECT_COLUMNS}
            """,
            [name, tags, notes, scenario_id],
        ).fetchone()
    finally:
        conn.close()
    return _row_to_scenario(row) if row is not None else None


def list_scenarios() -> list[ScenarioRow]:
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT {_SCENARIO_SELECT_COLUMNS}
            FROM scenarios
            WHERE saved = TRUE
            ORDER BY created_at DESC
            """
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_scenario(row) for row in rows]


def get_scenario(scenario_id: str) -> ScenarioDetail | None:
    conn = get_connection()
    try:
        row = conn.execute(
            f"""
            SELECT {_SCENARIO_SELECT_COLUMNS}
            FROM scenarios WHERE id = ?
            """,
            [scenario_id],
        ).fetchone()
        if row is None:
            return None
        result_rows = conn.execute(
            "SELECT result_type, data FROM scenario_results WHERE scenario_id = ?",
            [scenario_id],
        ).fetchall()
    finally:
        conn.close()

    results: dict[str, str] = {}
    for result_type, data in result_rows:
        if data is None:
            continue
        results[result_type] = bytes(data).decode("utf-8")
    return ScenarioDetail(scenario=_row_to_scenario(row), results=results)


@dataclass
class SnapshotRow:
    id: str
    scenario_id: str
    snapshot_type: str
    created_at: datetime | None
    # Optional short heading rendered above the image in PDF reports (#350).
    title: str | None = None
    caption: str | None = None


# Sentinel used by :func:`update_snapshot` to distinguish "field omitted from
# the PATCH" (leave column untouched) from "field set to None" (write NULL).
# A bare ``None`` cannot carry that distinction once the request is parsed.
_UNSET: Any = object()


def _row_to_snapshot(row: tuple) -> SnapshotRow:
    return SnapshotRow(
        id=row[0],
        scenario_id=row[1],
        snapshot_type=row[2],
        created_at=row[3],
        title=row[4],
        caption=row[5],
    )


_SNAPSHOT_SELECT_COLUMNS = "id, scenario_id, snapshot_type, created_at, title, caption"


def list_snapshots(scenario_id: str) -> list[SnapshotRow]:
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT {_SNAPSHOT_SELECT_COLUMNS}
            FROM snapshots WHERE scenario_id = ?
            ORDER BY created_at DESC
            """,
            [scenario_id],
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_snapshot(r) for r in rows]


def create_snapshot(
    *,
    scenario_id: str,
    snapshot_type: str,
    image: bytes,
    title: str | None = None,
    caption: str | None = None,
) -> SnapshotRow:
    """Insert one snapshot row and promote the parent scenario to ``saved=TRUE``.

    Raises :class:`ScenarioNotFound` if ``scenario_id`` does not exist;
    no row is created. Returns the inserted row (without the image bytes).
    """
    snapshot_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        parent = conn.execute("SELECT id FROM scenarios WHERE id = ?", [scenario_id]).fetchone()
        if parent is None:
            raise ScenarioNotFound(scenario_id)
        conn.execute(
            """
            INSERT INTO snapshots (id, scenario_id, snapshot_type, image, title, caption)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [snapshot_id, scenario_id, snapshot_type, image, title, caption],
        )
        # Save promotion (#302): the user has invested effort in this scenario,
        # so it must remain visible in the workspace. Capturing without this
        # would let an unsaved row's snapshots vanish on GC.
        conn.execute(
            "UPDATE scenarios SET saved = TRUE WHERE id = ?",
            [scenario_id],
        )
        row = conn.execute(
            f"""
            SELECT {_SNAPSHOT_SELECT_COLUMNS}
            FROM snapshots WHERE id = ?
            """,
            [snapshot_id],
        ).fetchone()
    finally:
        conn.close()
    assert row is not None  # just inserted above
    return _row_to_snapshot(row)


def get_snapshot_image(snapshot_id: str) -> tuple[bytes, str] | None:
    """Return ``(image_bytes, mime)`` or ``None`` if the snapshot is missing."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT image FROM snapshots WHERE id = ?", [snapshot_id]).fetchone()
    finally:
        conn.close()
    if row is None or row[0] is None:
        return None
    return bytes(row[0]), "image/png"


def update_snapshot(
    snapshot_id: str,
    *,
    title: Any = _UNSET,
    caption: Any = _UNSET,
) -> SnapshotRow | None:
    """Partial update of a snapshot's editable metadata.

    Each field is independent: passing ``_UNSET`` (the default) leaves the
    column untouched, passing ``None`` writes ``NULL``, and passing a string
    overwrites the column. Callers serialising from an HTTP body should use
    ``model_fields_set`` to decide which kwargs to forward so an omitted
    field in the JSON body does not wipe an existing value.

    Returns the updated row, or ``None`` if the id is unknown.
    """
    updates: list[str] = []
    values: list[Any] = []
    if title is not _UNSET:
        updates.append("title = ?")
        values.append(title)
    if caption is not _UNSET:
        updates.append("caption = ?")
        values.append(caption)
    if not updates:
        conn = get_connection()
        try:
            row = conn.execute(
                f"SELECT {_SNAPSHOT_SELECT_COLUMNS} FROM snapshots WHERE id = ?",
                [snapshot_id],
            ).fetchone()
        finally:
            conn.close()
        return _row_to_snapshot(row) if row is not None else None
    values.append(snapshot_id)
    conn = get_connection()
    try:
        row = conn.execute(
            f"""
            UPDATE snapshots SET {", ".join(updates)} WHERE id = ?
            RETURNING {_SNAPSHOT_SELECT_COLUMNS}
            """,
            values,
        ).fetchone()
    finally:
        conn.close()
    return _row_to_snapshot(row) if row is not None else None


def delete_snapshot(snapshot_id: str) -> bool:
    conn = get_connection()
    try:
        result = conn.execute(
            "DELETE FROM snapshots WHERE id = ? RETURNING id",
            [snapshot_id],
        ).fetchone()
        return result is not None
    finally:
        conn.close()


def delete_scenario(scenario_id: str) -> bool:
    """Delete a scenario and its cascading child rows. Returns True if removed."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM scenario_results WHERE scenario_id = ?", [scenario_id])
        conn.execute("DELETE FROM snapshots WHERE scenario_id = ?", [scenario_id])
        result = conn.execute("DELETE FROM scenarios WHERE id = ?", [scenario_id]).fetchone()
        return bool(result and result[0])
    finally:
        conn.close()


def read_result_blobs(temp_dir: Path) -> dict[str, bytes]:
    """Collect the JSON result files the scenario runner writes to temp_dir.

    Missing files are skipped silently — not every scenario run produces
    every artifact (e.g. historical runs have no cost-benefit data). The
    caller decides whether a missing artifact warrants an error.
    """
    sources = {
        "hazard_geojson": temp_dir / "hazards_geodata.json",
        "exposure_geojson": temp_dir / "exposures_geodata.json",
        "impact_geojson": temp_dir / "risks_geodata.json",
        "waterfall_data": temp_dir / "risks_waterfall_data.json",
        "costben_data": temp_dir / "cost_benefit_data.json",
    }
    blobs: dict[str, bytes] = {}
    for result_type, source in sources.items():
        if source.is_file():
            blobs[result_type] = source.read_bytes()
    return blobs


_SCENARIO_SELECT_COLUMNS = """
    id, name, tags, notes, country, hazard_type, scenario,
    exposure_type, asset_type, ref_year,
    future_year, annual_growth, is_era, app_option, status,
    created_at,
    app_version, engine, engine_version, climada_version,
    entity_data_sha256, hazard_data_sha256, country_config_sha256,
    random_seed, computed_at, is_imported, saved
"""


def _row_to_scenario(row: tuple) -> ScenarioRow:
    return ScenarioRow(
        id=row[0],
        name=row[1],
        tags=row[2],
        notes=row[3],
        country=row[4],
        hazard_type=row[5],
        scenario=row[6],
        exposure_type=row[7],
        asset_type=row[8],
        ref_year=row[9],
        future_year=row[10],
        annual_growth=row[11],
        is_era=row[12],
        app_option=row[13],
        status=row[14],
        created_at=row[15],
        app_version=row[16],
        engine=row[17],
        engine_version=row[18],
        climada_version=row[19],
        entity_data_sha256=row[20],
        hazard_data_sha256=row[21],
        country_config_sha256=row[22],
        random_seed=row[23],
        computed_at=row[24],
        is_imported=bool(row[25]) if row[25] is not None else False,
        saved=bool(row[26]) if row[26] is not None else False,
    )
