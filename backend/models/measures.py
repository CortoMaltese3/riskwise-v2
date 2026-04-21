"""Adaptation measures models."""

from __future__ import annotations

from datetime import datetime

from models.common import Status
from pydantic import BaseModel, ConfigDict, Field


class Measure(BaseModel):
    id: str
    measure_set_id: str
    measure_set_name: str
    name: str
    hazard_type: str
    country: str | None = None
    exposure_type: str | None = None
    cost_factor: float
    hazard_reduction_percentage: float
    description: str | None = None
    source_reference: str | None = None
    is_builtin: bool


class MeasuresData(BaseModel):
    # ``adaptationMeasures`` stays a flat list of names for backwards
    # compatibility with the scenario-run pipeline (which only needs names).
    # ``measures`` carries the full metadata the UI uses to render the
    # built-in/custom chips and source-reference tooltips introduced with
    # issue #92.
    adaptationMeasures: list[str]
    measures: list[Measure] = Field(default_factory=list)


class MeasuresResponse(BaseModel):
    data: MeasuresData
    status: Status


class MeasureSet(BaseModel):
    id: str
    name: str
    uploaded_at: datetime
    is_builtin: bool
    sha256: str | None = None
    measure_count: int = 0
    countries: str | None = None
    hazards: str | None = None


class MeasureSetsResponse(BaseModel):
    data: list[MeasureSet]
    status: Status


class MeasureSetUploadRequest(BaseModel):
    """Payload for POST ``/api/v1/measures/datasets``.

    As with the CRED upload endpoint, the renderer passes the xlsx path on
    disk rather than multipart bytes — Electron and the backend share the
    user's filesystem, so streaming through the loopback channel is
    unnecessary overhead.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1)
    xlsx_path: str = Field(..., min_length=1)


class MeasureSetUploadResponse(BaseModel):
    data: MeasureSet
    status: Status


class MeasureSetDeleteData(BaseModel):
    id: str


class MeasureSetDeleteResponse(BaseModel):
    data: MeasureSetDeleteData
    status: Status
