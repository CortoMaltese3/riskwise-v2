"""Saved scenario / report endpoint models."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel, ConfigDict, Field


class ReportItem(BaseModel):
    """One persisted report row.

    The legacy storage layer attaches arbitrary metadata to each report; we
    accept any extra keys and only validate the ones the UI actively reads.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    scenario_id: str | None = None
    type: str | None = None
    image: str | None = None
    data: dict | None = None


class ReportListResponse(BaseModel):
    data: list[ReportItem]
    status: Status


class ReportResponse(BaseModel):
    data: ReportItem
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


class SaveScenarioResponseData(BaseModel):
    data: dict


class SaveScenarioResponse(BaseModel):
    data: SaveScenarioResponseData
    status: Status


class DeleteReportResponse(BaseModel):
    data: dict
    status: Status
