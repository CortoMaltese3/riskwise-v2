"""Pydantic models for the read-only impact-function viewer (issue #452)."""

from __future__ import annotations

from pydantic import BaseModel

from backend.models.common import Status


class ImpactFunctionPayload(BaseModel):
    """The full curve plus metadata for one impact function."""

    id: int
    name: str
    haz_type: str
    exp_type: str
    intensity_unit: str
    intensity: list[float]
    mdd: list[float]
    paa: list[float]


class ImpactFunctionResponse(BaseModel):
    data: ImpactFunctionPayload
    status: Status
