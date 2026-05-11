"""DuckDB data layer: connection factory and migration runner.

Raw SQL is confined to this package so the data-access surface stays
auditable; callers elsewhere in the backend import helpers from here.
"""

from __future__ import annotations

from backend.db.connection import DB_FILE_NAME, DB_PATH_ENV_VAR, get_connection, resolve_db_path
from backend.db.migrations import (
    MIGRATIONS_DIR,
    MigrationError,
    run_migrations,
    run_startup_migrations,
)
from backend.db.scenario_store import (
    RESULT_TYPES,
    ScenarioDetail,
    ScenarioNotFound,
    ScenarioRow,
    SnapshotRow,
    create_snapshot,
    delete_scenario,
    delete_snapshot,
    get_scenario,
    get_scenario_snapshots_with_image,
    get_snapshot_image,
    insert_scenario,
    list_scenarios,
    list_snapshots,
    patch_scenario_metadata,
    read_result_blobs,
    update_scenario_metadata,
    update_snapshot,
)
from backend.db.user_settings_store import (
    UserSettingsRow,
    get_user_settings,
    update_user_settings,
)

__all__ = [
    "DB_FILE_NAME",
    "DB_PATH_ENV_VAR",
    "MIGRATIONS_DIR",
    "MigrationError",
    "RESULT_TYPES",
    "ScenarioDetail",
    "ScenarioNotFound",
    "ScenarioRow",
    "SnapshotRow",
    "UserSettingsRow",
    "create_snapshot",
    "delete_scenario",
    "delete_snapshot",
    "get_connection",
    "get_scenario",
    "get_scenario_snapshots_with_image",
    "get_snapshot_image",
    "get_user_settings",
    "insert_scenario",
    "list_scenarios",
    "list_snapshots",
    "patch_scenario_metadata",
    "read_result_blobs",
    "resolve_db_path",
    "run_migrations",
    "run_startup_migrations",
    "update_scenario_metadata",
    "update_snapshot",
    "update_user_settings",
]
