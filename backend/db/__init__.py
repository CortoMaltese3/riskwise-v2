"""DuckDB data layer: connection factory and migration runner.

Raw SQL is confined to this package so the data-access surface stays
auditable; callers elsewhere in the backend import helpers from here.
"""

from __future__ import annotations

from db.connection import DB_FILE_NAME, DB_PATH_ENV_VAR, get_connection, resolve_db_path
from db.migrations import (
    MIGRATIONS_DIR,
    MigrationError,
    run_migrations,
    run_startup_migrations,
)
from db.scenario_store import (
    RESULT_TYPES,
    ScenarioDetail,
    ScenarioRow,
    SnapshotRow,
    delete_scenario,
    delete_snapshot,
    get_scenario,
    insert_scenario,
    list_scenarios,
    list_snapshots,
    patch_scenario_metadata,
    read_result_blobs,
    update_scenario_metadata,
)

__all__ = [
    "DB_FILE_NAME",
    "DB_PATH_ENV_VAR",
    "MIGRATIONS_DIR",
    "MigrationError",
    "RESULT_TYPES",
    "ScenarioDetail",
    "ScenarioRow",
    "SnapshotRow",
    "delete_scenario",
    "delete_snapshot",
    "get_connection",
    "get_scenario",
    "insert_scenario",
    "list_scenarios",
    "list_snapshots",
    "patch_scenario_metadata",
    "read_result_blobs",
    "resolve_db_path",
    "run_migrations",
    "run_startup_migrations",
    "update_scenario_metadata",
]
