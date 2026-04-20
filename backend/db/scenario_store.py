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

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from db.connection import get_connection

_PROVENANCE_FIELDS: tuple[str, ...] = (
    "app_version",
    "engine_version",
    "climada_version",
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
    exposure_economic: str | None
    exposure_non_economic: str | None
    ref_year: int | None
    future_year: int | None
    annual_growth: float | None
    is_era: bool | None
    app_option: str | None
    status: str | None
    created_at: datetime | None


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
) -> None:
    """Persist a freshly-finished run: one ``scenarios`` row + N result blobs.

    ``provenance`` is mandatory: every scenario row must carry a complete
    set of reproducibility fields (see migration ``0002_provenance.sql``).
    A missing field is a handler-level error — the DB would also reject
    the insert via its NOT NULL constraint, but raising here gives the
    caller a clearer traceback pointing at the offending key.
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
                exposure_economic, exposure_non_economic, ref_year,
                future_year, annual_growth, is_era, app_option, status,
                app_version, engine_version, climada_version,
                entity_data_sha256, hazard_data_sha256, country_config_sha256,
                config_version, random_seed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                scenario_id,
                name,
                tags,
                notes,
                params.get("country"),
                params.get("hazard_type"),
                params.get("scenario"),
                params.get("exposure_economic"),
                params.get("exposure_non_economic"),
                params.get("ref_year"),
                params.get("future_year"),
                params.get("annual_growth"),
                params.get("is_era"),
                params.get("app_option"),
                status,
                provenance["app_version"],
                provenance["engine_version"],
                provenance["climada_version"],
                provenance["entity_data_sha256"],
                provenance["hazard_data_sha256"],
                provenance["country_config_sha256"],
                provenance["config_version"],
                provenance["random_seed"],
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
    finally:
        conn.close()


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
            """
            UPDATE scenarios SET name = ?, tags = ?, notes = ? WHERE id = ?
            RETURNING id, name, tags, notes, country, hazard_type, scenario,
                      exposure_economic, exposure_non_economic, ref_year,
                      future_year, annual_growth, is_era, app_option, status,
                      created_at
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
            """
            SELECT id, name, tags, notes, country, hazard_type, scenario,
                   exposure_economic, exposure_non_economic, ref_year,
                   future_year, annual_growth, is_era, app_option, status,
                   created_at
            FROM scenarios
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
            """
            SELECT id, name, tags, notes, country, hazard_type, scenario,
                   exposure_economic, exposure_non_economic, ref_year,
                   future_year, annual_growth, is_era, app_option, status,
                   created_at
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


def _row_to_scenario(row: tuple) -> ScenarioRow:
    return ScenarioRow(
        id=row[0],
        name=row[1],
        tags=row[2],
        notes=row[3],
        country=row[4],
        hazard_type=row[5],
        scenario=row[6],
        exposure_economic=row[7],
        exposure_non_economic=row[8],
        ref_year=row[9],
        future_year=row[10],
        annual_growth=row[11],
        is_era=row[12],
        app_option=row[13],
        status=row[14],
        created_at=row[15],
    )
