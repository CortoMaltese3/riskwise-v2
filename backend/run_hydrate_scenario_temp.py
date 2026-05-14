"""Hydrate the temp directory from a saved scenario's persisted blobs.

The Workspace ``Restore`` flow re-points the UI at a previously-saved
scenario. The maps and the waterfall/cost-benefit charts read their data
from per-run files in :data:`backend.constants.DATA_TEMP_DIR`, so the
restore path needs to rewrite those files from the rows the runner
persisted into ``scenario_results``. The runner already does this for
the in-process computation cache via ``_restore_from_computation_cache``;
this command is the same idea exposed over HTTP so the renderer can
trigger it after fetching the scenario detail.

The temp dir is wiped before the write so a half-restored state (stale
files from the previous run mixed with the new restore) never reaches
the renderer.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from backend.cli import Command, StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.db import RESULT_TYPE_TO_TEMP_FILE, ScenarioNotFound, get_scenario
from backend.utils.fs import clear_temp_dir


class RunHydrateScenarioTemp(Command):
    """Write a saved scenario's result blobs back into ``DATA_TEMP_DIR``."""

    requires_request = True

    def __init__(self, request: dict[str, Any] | None) -> None:
        super().__init__()
        self.scenario_id = str((request or {}).get("scenario_id") or "")

    def execute(self) -> dict[str, Any]:
        if not self.scenario_id:
            return {
                "data": None,
                "status": {
                    "code": StatusCode.VALIDATION_ERROR,
                    "message": "scenario_id is required.",
                },
            }

        detail = get_scenario(self.scenario_id)
        if detail is None:
            # Raise so the FastAPI endpoint can translate to HTTP 404. The
            # subprocess entry point ``main()`` still catches via ``run()``
            # and emits the standard error envelope to stdout.
            raise ScenarioNotFound(self.scenario_id)

        DATA_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        clear_temp_dir()

        written: list[str] = []
        for result_type, blob_str in detail.results.items():
            filename = RESULT_TYPE_TO_TEMP_FILE.get(result_type)
            if filename is None:
                # ``impact_summary`` and any future result types that are
                # not file-backed land here. Mirror the missing-file
                # behaviour of ``read_result_blobs`` and skip with a log.
                self.logger.warning(f"Skipping unknown result_type for temp hydrate: {result_type}")
                continue
            (DATA_TEMP_DIR / filename).write_bytes(blob_str.encode("utf-8"))
            written.append(result_type)

        return {
            "data": {"written": written},
            "status": {
                "code": StatusCode.SUCCESS,
                "message": "Scenario hydrated.",
            },
        }

    def error_envelope(self, exc: Exception) -> dict[str, Any]:
        return {
            "data": None,
            "status": {
                "code": StatusCode.ERROR,
                "message": f"Error while hydrating scenario temp dir. More info: {exc}",
            },
        }


if __name__ == "__main__":
    request = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    print(json.dumps(RunHydrateScenarioTemp(request).run()))
