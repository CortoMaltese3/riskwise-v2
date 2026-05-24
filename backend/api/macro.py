"""Macroeconomic dataset, CRED output, and chart-data routes."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.app import _dispatch
from backend.models import (
    CredDatasetDeleteResponse,
    CredDatasetsResponse,
    CredDatasetUploadRequest,
    CredDatasetUploadResponse,
    MacroChartDataRequest,
    MacroChartDataResponse,
    MacroCredOutputResponse,
)
from backend.uploads import enforce_upload_size_limit

router = APIRouter()


@router.get("/macro/datasets", response_model=CredDatasetsResponse)
async def macro_datasets() -> dict:
    from backend.db.cred_store import list_cred_datasets

    datasets = await asyncio.to_thread(list_cred_datasets)
    return {"data": datasets, "status": _status_ok()}


@router.post("/macro/datasets", response_model=CredDatasetUploadResponse)
async def macro_datasets_upload(payload: CredDatasetUploadRequest) -> dict:
    from backend.macroeconomic.cred_dataset_handler import CredDatasetError, import_dataset

    # See ``measure_datasets_upload`` for the rationale; same Area-18 cap
    # applied before the openpyxl reader is given the file.
    enforce_upload_size_limit(Path(payload.xlsx_path), label="CRED dataset")
    try:
        metadata = await asyncio.to_thread(import_dataset, payload.name, Path(payload.xlsx_path))
    except CredDatasetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": metadata, "status": _status_ok()}


@router.delete("/macro/datasets/{dataset_id}", response_model=CredDatasetDeleteResponse)
async def macro_datasets_delete(dataset_id: str) -> dict:
    from backend.macroeconomic.cred_dataset_handler import (
        CredDatasetError,
        CredDatasetNotFound,
        CredDatasetProtected,
        delete_dataset,
    )

    try:
        await asyncio.to_thread(delete_dataset, dataset_id)
    except CredDatasetProtected as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CredDatasetNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CredDatasetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": {"id": dataset_id}, "status": _status_ok()}


@router.get("/macro/cred-output", response_model=MacroCredOutputResponse)
async def macro_cred_output(dataset_id: str | None = None) -> dict:
    return await _dispatch("run_fetch_cred_output.py", {"dataset_id": dataset_id})


@router.post("/macro/chart-data", response_model=MacroChartDataResponse)
async def macro_chart_data(payload: MacroChartDataRequest) -> dict:
    return await _dispatch("run_fetch_macro_chart_data.py", payload.model_dump())
