"""Saved scenario workspace endpoint models."""

from __future__ import annotations

from datetime import datetime

from models.common import Status
from pydantic import BaseModel, ConfigDict, Field


class ScenarioWorkspaceItem(BaseModel):
    """A saved-scenario row as it appears in the workspace list."""

    id: str
    name: str | None = None
    tags: str | None = None
    notes: str | None = None
    country: str | None = None
    hazard_type: str | None = None
    scenario: str | None = None
    exposure_economic: str | None = None
    exposure_non_economic: str | None = None
    ref_year: int | None = None
    future_year: int | None = None
    annual_growth: float | None = None
    is_era: bool | None = None
    app_option: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    # Provenance fields surfaced for the print view, Excel report, and the
    # ".riskwise-scenario" export. Optional so older rows without provenance
    # still serialise.
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


class ScenarioDetailPayload(BaseModel):
    """Full scenario: metadata row plus the result blobs keyed by type.

    Result values are pre-decoded JSON strings — the frontend parses them
    as needed. Storing raw strings keeps the payload auditable at the
    network boundary without adding a per-type Pydantic schema here.
    """

    scenario: ScenarioWorkspaceItem
    results: dict[str, str] = Field(default_factory=dict)


class ScenarioListResponse(BaseModel):
    data: list[ScenarioWorkspaceItem]
    status: Status


class ScenarioDetailResponse(BaseModel):
    data: ScenarioDetailPayload
    status: Status


class SaveScenarioRequest(BaseModel):
    """Body for ``POST /api/v1/scenarios/{id}/save`` — the save-as dialog."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1)
    tags: str | None = None
    notes: str | None = None


class SaveScenarioResponse(BaseModel):
    data: ScenarioWorkspaceItem
    status: Status


class PatchScenarioRequest(BaseModel):
    """Body for ``PATCH /api/v1/scenarios/{id}`` — partial metadata update."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    tags: str | None = None
    notes: str | None = None


class DeleteScenarioResponse(BaseModel):
    data: dict
    status: Status


class SnapshotItem(BaseModel):
    id: str
    scenario_id: str
    snapshot_type: str
    created_at: datetime | None = None


class SnapshotListResponse(BaseModel):
    data: list[SnapshotItem]
    status: Status


class DeleteSnapshotResponse(BaseModel):
    data: dict
    status: Status


class ExportReportRequest(BaseModel):
    """Body posted to ``POST /api/v1/scenarios/{id}/export``.

    ``scenarioRunCode`` is overwritten by the FastAPI handler with the path
    parameter, so the field is optional in the body.
    """

    model_config = ConfigDict(extra="allow")

    exportType: str = Field(..., min_length=1)
    scenarioRunCode: str | None = None
    report: dict | None = None


class ExportReportData(BaseModel):
    status: str = "delegated_to_electron"
    report_path: str = ""


class ExportReportResponse(BaseModel):
    data: ExportReportData
    status: Status


class ScenarioExportData(BaseModel):
    """Shape returned by ``GET /api/v1/scenario/{id}/export-data`` (#122).

    The endpoint that streams the binary uses ``FileResponse`` directly and
    does not return JSON; this model exists so the matching "build the ZIP
    at a temp path" helper used by Electron has a typed envelope to mirror
    the workspace export flow.
    """

    export_path: str
    filename: str
    scenario_id: str


class ScenarioExportResponse(BaseModel):
    data: ScenarioExportData
    status: Status


class ScenarioImportRequest(BaseModel):
    """Body posted to ``POST /api/v1/scenario/import`` (#122).

    The renderer never reads the ZIP bytes; Electron's open dialog hands
    the absolute path to the backend, which validates ``provenance.json``
    and inserts the scenario as read-only (``is_imported = TRUE``).
    """

    model_config = ConfigDict(extra="forbid")

    import_path: str = Field(..., min_length=1)


class ScenarioImportData(BaseModel):
    scenario_id: str
    name: str | None = None


class ScenarioImportResponse(BaseModel):
    data: ScenarioImportData
    status: Status
