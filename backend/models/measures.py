"""Adaptation measures models."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel


class Measure(BaseModel):
    id: str
    name: str
    hazard_type: str
    country: str | None
    exposure_type: str | None
    cost_factor: float
    hazard_reduction_percentage: float
    description: str | None
    source_reference: str
    is_builtin: bool


class MeasuresData(BaseModel):
    adaptationMeasures: list[str]


class MeasuresResponse(BaseModel):
    data: MeasuresData
    status: Status
