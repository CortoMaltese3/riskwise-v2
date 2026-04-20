"""Macroeconomic chart and CRED-output models."""

from __future__ import annotations

from datetime import datetime

from models.common import Status
from pydantic import BaseModel, ConfigDict, Field


class MacroChartDataRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    countryName: str | None = None
    scenario: str | None = None
    sector: str | None = None
    variable: str | None = None


class ChartDataDataset(BaseModel):
    model_config = ConfigDict(extra="allow")

    label: str | None = None
    data: list[float | int | None] = Field(default_factory=list)


class ChartDataPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    years: list[int | str] = Field(default_factory=list)
    datasets: list[ChartDataDataset] = Field(default_factory=list)
    title: str = ""


class MacroChartDataResponse(BaseModel):
    data: ChartDataPayload
    status: Status


class MacroCredOutputResponse(BaseModel):
    """The CRED output is a flat list of dict rows whose keys vary by export.

    Frontend code groups and filters them client-side, so we don't pin a row
    schema here.
    """

    data: list[dict]
    status: Status


class CredDataset(BaseModel):
    id: str
    name: str
    source: str | None = None
    uploaded_at: datetime
    is_builtin: bool
    sha256: str | None = None


class CredDatasetsResponse(BaseModel):
    data: list[CredDataset]
    status: Status
