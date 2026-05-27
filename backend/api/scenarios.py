"""Scenario record CRUD: list/get/patch/save/delete/hydrate + snapshot listing."""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.cli import StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.logging_config import get_logger
from backend.models import (
    DeleteScenarioResponse,
    HydrateScenarioResponse,
    PatchScenarioRequest,
    SaveScenarioRequest,
    SaveScenarioResponse,
    ScenarioDetailResponse,
    ScenarioListResponse,
    SnapshotListResponse,
)

router = APIRouter()
logger = get_logger("backend.api.scenarios")


def _scenario_row_to_dict(row: Any) -> dict:
    payload = asdict(row)
    # ``modified`` is derived state — the renderer surfaces a "Modified"
    # badge whenever a run carried an IF override (#453). Pre-computing
    # here keeps the consumers from re-deriving the same boolean three
    # times across the workspace, results, and viewer code paths.
    payload["modified"] = payload.get("impact_function_override") is not None
    return payload


def _hydrate_scenario_temp_sync(scenario_id: str) -> dict:
    """Rewrite a saved scenario's persisted blobs back into ``DATA_TEMP_DIR``.

    The Workspace ``Restore`` flow needs the maps and the waterfall /
    cost-benefit charts (which read from per-run JSON files) to paint
    the restored state. The temp dir is wiped before the write so a
    half-restored state never reaches the renderer. ``ScenarioNotFound``
    is allowed to propagate so the endpoint can translate it to a 404
    instead of an error envelope.
    """
    from backend.db import RESULT_TYPE_TO_TEMP_FILE, get_scenario
    from backend.utils.fs import clear_temp_dir

    if not scenario_id:
        return {
            "data": None,
            "status": {
                "code": StatusCode.VALIDATION_ERROR,
                "message": "scenario_id is required.",
            },
        }

    detail = get_scenario(scenario_id)
    if detail is None:
        from backend.db import ScenarioNotFound

        raise ScenarioNotFound(scenario_id)

    DATA_TEMP_DIR.mkdir(parents=True, exist_ok=True)
    clear_temp_dir()

    written: list[str] = []
    for result_type, blob_str in detail.results.items():
        filename = RESULT_TYPE_TO_TEMP_FILE.get(result_type)
        if filename is None:
            # ``impact_summary`` and any future result types that are
            # not file-backed land here. Mirror the missing-file
            # behaviour of ``read_result_blobs`` and skip with a log.
            logger.warning(f"Skipping unknown result_type for temp hydrate: {result_type}")
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


@router.get("/scenarios", response_model=ScenarioListResponse)
async def list_scenarios_endpoint() -> dict:
    from backend.db import list_scenarios

    rows = await asyncio.to_thread(list_scenarios)
    return {"data": [_scenario_row_to_dict(r) for r in rows], "status": _status_ok()}


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetailResponse)
async def get_scenario_endpoint(scenario_id: str) -> dict:
    from backend.db import get_scenario

    detail = await asyncio.to_thread(get_scenario, scenario_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "data": {
            "scenario": _scenario_row_to_dict(detail.scenario),
            "results": detail.results,
        },
        "status": _status_ok(),
    }


@router.patch("/scenarios/{scenario_id}", response_model=SaveScenarioResponse)
async def patch_scenario_endpoint(scenario_id: str, payload: PatchScenarioRequest) -> dict:
    from backend.db import patch_scenario_metadata

    row = await asyncio.to_thread(
        patch_scenario_metadata,
        scenario_id,
        name=payload.name,
        tags=payload.tags,
        notes=payload.notes,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": _scenario_row_to_dict(row), "status": _status_ok()}


@router.get("/scenarios/{scenario_id}/snapshots", response_model=SnapshotListResponse)
async def list_snapshots_endpoint(scenario_id: str) -> dict:
    from backend.db import list_snapshots

    rows = await asyncio.to_thread(list_snapshots, scenario_id)
    return {"data": [asdict(r) for r in rows], "status": _status_ok()}


@router.post("/scenarios/{scenario_id}/save", response_model=SaveScenarioResponse)
async def save_scenario_endpoint(scenario_id: str, payload: SaveScenarioRequest) -> dict:
    from backend.db import update_scenario_metadata

    row = await asyncio.to_thread(
        update_scenario_metadata,
        scenario_id,
        name=payload.name,
        tags=payload.tags,
        notes=payload.notes,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": _scenario_row_to_dict(row), "status": _status_ok()}


@router.delete("/scenarios/{scenario_id}", response_model=DeleteScenarioResponse)
async def delete_scenario_endpoint(scenario_id: str) -> dict:
    from backend.db import delete_scenario

    removed = await asyncio.to_thread(delete_scenario, scenario_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": {"id": scenario_id}, "status": _status_ok()}


@router.post(
    "/scenarios/{scenario_id}/hydrate-temp",
    response_model=HydrateScenarioResponse,
)
async def hydrate_scenario_temp_endpoint(scenario_id: str) -> dict:
    """Rewrite the saved scenario's blobs back into the temp dir.

    Required by the Workspace ``Restore`` flow: the maps and the
    waterfall/cost-benefit charts read from per-run JSON files, so the
    renderer cannot show the restored state until those files exist on
    disk again. See ``backend.run_hydrate_scenario_temp`` for details.
    """
    from backend.db import ScenarioNotFound

    try:
        return await asyncio.to_thread(_hydrate_scenario_temp_sync, scenario_id)
    except ScenarioNotFound as exc:
        raise HTTPException(status_code=404, detail="Scenario not found") from exc
