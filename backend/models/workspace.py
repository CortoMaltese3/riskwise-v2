"""Pydantic models for the workspace ZIP export/import endpoints (issue #82)."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel, ConfigDict, Field


class WorkspaceExportData(BaseModel):
    """Shape returned by ``GET /api/v1/workspace/export-data``.

    ``export_path`` points to a file on local disk under the system temp
    directory. The Electron main process copies it to the user's chosen
    destination and unlinks the source afterwards.
    """

    export_path: str
    scenario_count: int
    export_date: str
    app_version: str


class WorkspaceExportResponse(BaseModel):
    data: WorkspaceExportData
    status: Status


class WorkspaceImportRequest(BaseModel):
    """Body posted to ``POST /api/v1/workspace/import``.

    The renderer never reads the ZIP bytes — Electron's open dialog hands
    back an absolute path, and the backend consumes the file from disk.
    """

    model_config = ConfigDict(extra="forbid")

    import_path: str = Field(..., min_length=1)


class WorkspaceImportData(BaseModel):
    imported_count: int
    skipped_count: int


class WorkspaceImportResponse(BaseModel):
    data: WorkspaceImportData
    status: Status
