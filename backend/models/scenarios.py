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


class DeleteScenarioResponse(BaseModel):
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
    report_path: str = ""


class ExportReportResponse(BaseModel):
    data: ExportReportData
    status: Status
