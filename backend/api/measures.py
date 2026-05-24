"""Measures catalog and dataset upload/delete routes."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.app import _dispatch
from backend.models import (
    MeasureSetDeleteResponse,
    MeasureSetsResponse,
    MeasureSetUploadRequest,
    MeasureSetUploadResponse,
    MeasuresResponse,
)
from backend.uploads import enforce_upload_size_limit

router = APIRouter()


@router.get("/measures/{country}/{hazard}", response_model=MeasuresResponse)
async def measures(
    country: str,
    hazard: str,
    measure_set_id: str | None = None,
    exposure_file: str | None = None,
    exposure_type: str | None = None,
) -> dict:
    payload: dict = {"countryName": country, "hazardType": hazard}
    if measure_set_id is not None:
        payload["measureSetId"] = measure_set_id
    # ``exposure_file``, when supplied, lets the dispatcher load the
    # entity and return its measure names so the renderer can tag
    # catalog cards as "in scenario" / "not in scenario" (issue #450).
    if exposure_file is not None:
        payload["exposureFile"] = exposure_file
    # ``exposure_type`` is the ERA fallback: with no uploaded workbook
    # the dispatcher rebuilds the canonical entity filename so the same
    # applicability tagging works for built-in country/hazard/exposure
    # combos.
    if exposure_type is not None:
        payload["exposureType"] = exposure_type
    return await _dispatch("run_fetch_measures.py", payload)


@router.get("/measures/datasets", response_model=MeasureSetsResponse)
async def measure_datasets() -> dict:
    from backend.db.measures_store import list_measure_sets

    datasets = await asyncio.to_thread(list_measure_sets)
    return {"data": datasets, "status": _status_ok()}


@router.post("/measures/datasets", response_model=MeasureSetUploadResponse)
async def measure_datasets_upload(payload: MeasureSetUploadRequest) -> dict:
    from backend.measures.measure_dataset_handler import MeasureDatasetError, import_dataset

    # Area-18 zip-bomb defence: cap upload size before the xlsx parser
    # touches the file. ``enforce_upload_size_limit`` raises
    # ``UploadTooLargeError`` (413 ``upload_too_large``) which the global
    # ``RiskWiseError`` handler translates to a structured envelope.
    enforce_upload_size_limit(Path(payload.xlsx_path), label="measures workbook")
    try:
        metadata = await asyncio.to_thread(import_dataset, payload.name, Path(payload.xlsx_path))
    except MeasureDatasetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": metadata, "status": _status_ok()}


@router.delete(
    "/measures/datasets/{measure_set_id}",
    response_model=MeasureSetDeleteResponse,
)
async def measure_datasets_delete(measure_set_id: str) -> dict:
    from backend.measures.measure_dataset_handler import (
        MeasureDatasetError,
        MeasureDatasetNotFound,
        MeasureDatasetProtected,
        delete_dataset,
    )

    try:
        await asyncio.to_thread(delete_dataset, measure_set_id)
    except MeasureDatasetProtected as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except MeasureDatasetNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MeasureDatasetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": {"id": measure_set_id}, "status": _status_ok()}
