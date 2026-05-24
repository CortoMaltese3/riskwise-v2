"""Macroeconomic dataset, CRED output, and chart-data routes."""

from __future__ import annotations

import asyncio
from pathlib import Path
from time import time

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.cli import StatusCode
from backend.logging_config import get_logger
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
from backend.utils.strings import set_macroeconomic_chart_title

router = APIRouter()
logger = get_logger("backend.api.macro")

_EMPTY_CHART: dict = {"years": [], "datasets": [], "title": ""}


def _fetch_cred_output_sync(dataset_id: str | None) -> dict:
    from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler

    initial_time = time()
    handler = MacroeconomicHandler()
    try:
        cred_data = handler.get_cred_data_from_db(dataset_id=dataset_id)
        logger.info(f"Finished fetching CRED data in {time() - initial_time:.2f} sec.")
        return {
            "data": cred_data,
            "status": {
                "code": StatusCode.SUCCESS,
                "message": "CRED output data fetched successfully.",
            },
        }
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        logger.error(f"Failed to fetch CRED output: {exc}")
        return {
            "data": [],
            "status": {
                "code": StatusCode.ERROR,
                "message": f"An error occurred while fetching CRED output. More info: {exc}",
            },
        }


def _fetch_macro_chart_data_sync(payload: dict) -> dict:
    from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler

    initial_time = time()
    country_name = str(payload.get("countryName", "")).strip()
    scenario = str(payload.get("scenario", "")).strip()
    sector = str(payload.get("sector", "")).strip()
    variable = str(payload.get("variable", "")).strip()
    dataset_id_raw = payload.get("dataset_id")
    dataset_id = str(dataset_id_raw).strip() if dataset_id_raw else None

    handler = MacroeconomicHandler()
    try:
        chart = handler.get_chart_data(
            country=country_name,
            scenario=scenario,
            sector=sector,
            variable=variable,
            dataset_id=dataset_id,
        )
        title = set_macroeconomic_chart_title(country_name, variable)
        logger.info(f"Finished fetching macro chart data in {time() - initial_time:.2f} sec.")
        return {
            "data": {"years": chart["years"], "datasets": chart["datasets"], "title": title},
            "status": {
                "code": StatusCode.SUCCESS,
                "message": "Macroeconomic chart data fetched successfully.",
            },
        }
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        logger.error(f"Failed to fetch macro chart data: {exc}")
        return {
            "data": dict(_EMPTY_CHART),
            "status": {
                "code": StatusCode.ERROR,
                "message": f"An error occurred fetching macro chart data. More info: {exc}",
            },
        }


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
    return await asyncio.to_thread(_fetch_cred_output_sync, dataset_id)


@router.post("/macro/chart-data", response_model=MacroChartDataResponse)
async def macro_chart_data(payload: MacroChartDataRequest) -> dict:
    return await asyncio.to_thread(_fetch_macro_chart_data_sync, payload.model_dump())
