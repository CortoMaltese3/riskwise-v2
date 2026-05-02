"""Pydantic models for the Settings > Custom Data endpoints (issue #90).

The Electron renderer hands the backend an absolute path to a ``.zip`` on
local disk — same pattern as the workspace import (issue #82). The backend
reads from disk; no multipart/HTTP file bytes cross the loopback channel.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.models.common import Status


class CustomDataValidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zip_path: str = Field(..., min_length=1)


class CustomDataValidateData(BaseModel):
    valid: bool
    errors: list[str]
    country_name: str
    iso3: str


class CustomDataValidateResponse(BaseModel):
    data: CustomDataValidateData
    status: Status


class CustomDataImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zip_path: str = Field(..., min_length=1)


class CustomDataImportData(BaseModel):
    iso3: str
    country_name: str
    installed_at: str


class CustomDataImportResponse(BaseModel):
    data: CustomDataImportData
    status: Status


class CustomCountryEntry(BaseModel):
    iso3: str
    country_name: str
    installed_at: str
    source: str


class CustomDataListData(BaseModel):
    countries: list[CustomCountryEntry]


class CustomDataListResponse(BaseModel):
    data: CustomDataListData
    status: Status


class CustomDataDeleteData(BaseModel):
    iso3: str


class CustomDataDeleteResponse(BaseModel):
    data: CustomDataDeleteData
    status: Status
