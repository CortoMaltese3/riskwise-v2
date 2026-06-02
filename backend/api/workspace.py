"""Workspace export and import routes."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import cast

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.models import (
    WorkspaceExportResponse,
    WorkspaceImportRequest,
    WorkspaceImportResponse,
)

router = APIRouter()


@router.get("/workspace/export-data", response_model=WorkspaceExportResponse)
async def workspace_export() -> dict:
    """Build a ``.riskwise-workspace`` ZIP at a temp path and return its location.

    The Electron main process copies the file to the user's chosen save
    location and removes the temp copy afterwards, so the backend never
    needs to stream binary through the IPC channel.
    """
    from backend.workspace_handler import build_export_to_temp

    output_path, manifest = await asyncio.to_thread(build_export_to_temp)
    return {
        "data": {
            "export_path": str(output_path),
            "scenario_count": int(cast(int, manifest["scenario_count"])),
            "export_date": str(manifest["export_date"]),
            "app_version": str(manifest["app_version"]),
        },
        "status": _status_ok(),
    }


@router.post("/workspace/import", response_model=WorkspaceImportResponse)
async def workspace_import(payload: WorkspaceImportRequest) -> dict:
    from backend.workspace_handler import WorkspaceImportError, import_workspace

    try:
        counts = await asyncio.to_thread(import_workspace, Path(payload.import_path))
    except WorkspaceImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": counts, "status": _status_ok()}
