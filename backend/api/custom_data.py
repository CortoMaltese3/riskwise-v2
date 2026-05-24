"""Custom-data pack validate/import/list/delete routes."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.models import (
    CustomDataDeleteResponse,
    CustomDataImportRequest,
    CustomDataImportResponse,
    CustomDataListResponse,
    CustomDataValidateRequest,
    CustomDataValidateResponse,
)
from backend.uploads import enforce_upload_size_limit

router = APIRouter()


@router.post("/custom-data/validate", response_model=CustomDataValidateResponse)
async def custom_data_validate(payload: CustomDataValidateRequest) -> dict:
    from backend.custom_data_handler import validate_pack

    data = await asyncio.to_thread(validate_pack, Path(payload.zip_path))
    return {"data": data, "status": _status_ok()}


@router.post("/custom-data/import", response_model=CustomDataImportResponse)
async def custom_data_import(payload: CustomDataImportRequest) -> dict:
    from backend.custom_data_handler import CustomDataError, import_pack

    # Same Area-18 cap as the dataset uploads — applied here because the
    # ZIP gets unpacked into ``user-data/countries/<ISO3>/`` and a 200 MiB
    # archive of zeros would explode regardless of the layout checks.
    enforce_upload_size_limit(Path(payload.zip_path), label="custom-data pack")
    try:
        data = await asyncio.to_thread(import_pack, Path(payload.zip_path))
    except CustomDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": data, "status": _status_ok()}


@router.get("/custom-data", response_model=CustomDataListResponse)
async def custom_data_list() -> dict:
    from backend.custom_data_handler import list_custom_countries

    countries_list = await asyncio.to_thread(list_custom_countries)
    return {"data": {"countries": countries_list}, "status": _status_ok()}


@router.delete("/custom-data/{iso3}", response_model=CustomDataDeleteResponse)
async def custom_data_delete(iso3: str) -> dict:
    from backend.custom_data_handler import CustomDataError, delete_custom_country

    try:
        await asyncio.to_thread(delete_custom_country, iso3)
    except CustomDataError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"data": {"iso3": iso3.upper()}, "status": _status_ok()}
