"""Data-availability check models."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel, Field


class DataValidateRequest(BaseModel):
    country: str = Field(..., min_length=1)
    dataType: str = Field(..., min_length=1)


class DataValidateData(BaseModel):
    data: dict


class DataValidateResponse(BaseModel):
    data: DataValidateData
    status: Status
