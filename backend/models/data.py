"""Data-availability check models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from backend.models.common import Status


class DataValidateRequest(BaseModel):
    country: str = Field(..., min_length=1)
    dataType: str = Field(..., min_length=1)


class DataValidateData(BaseModel):
    data: dict


class DataValidateResponse(BaseModel):
    data: DataValidateData
    status: Status
