"""Adaptation measures models."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel


class MeasuresData(BaseModel):
    adaptationMeasures: list[str]


class MeasuresResponse(BaseModel):
    data: MeasuresData
    status: Status
