"""Measures catalog and dataset upload/delete routes."""

from __future__ import annotations

import asyncio
from pathlib import Path
from time import time

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.cli import StatusCode
from backend.costben.measure_enrichment import (
    enrich_with_catalog,
    load_entity_measures,
    resolve_entity_filename,
)
from backend.db.connection import get_connection, resolve_db_path
from backend.logging_config import get_logger
from backend.models import (
    MeasureSetDeleteResponse,
    MeasureSetsResponse,
    MeasureSetUploadRequest,
    MeasureSetUploadResponse,
    MeasuresResponse,
)
from backend.uploads import enforce_upload_size_limit
from backend.utils.strings import beautify_hazard_type

router = APIRouter()
logger = get_logger("backend.api.measures")

_EMPTY_MEASURES_DATA: dict = {"adaptationMeasures": [], "measures": []}


def _fetch_measures_sync(
    country_name: str,
    hazard_type: str,
    measure_set_id: str | None,
    exposure_file: str | None,
    exposure_type: str | None,
) -> dict:
    """Run the picker query in a worker thread.

    The picker is entity-driven: an uploaded ``exposure_file`` (custom
    mode) or the canonical filename rebuilt from country + hazard +
    ``exposure_type`` (ERA mode) is loaded so its ``MeasureSpec`` list
    is enriched with catalog metadata; when no entity is available the
    raw catalog is returned so the picker still renders.
    """
    from backend.costben.costben_handler import CostBenefitHandler
    from backend.hazard.hazard_handler import HazardHandler

    initial_time = time()
    costben_handler = CostBenefitHandler()
    hazard_handler = HazardHandler()

    hazard_code = hazard_handler.get_hazard_code(hazard_type)
    hazard_beautified = beautify_hazard_type(hazard_type)

    conn = get_connection(resolve_db_path())
    try:
        catalog_rows = costben_handler.get_measures_from_db(
            conn, hazard_code, measure_set_id, country_name or None
        )
    finally:
        conn.close()

    entity_filename = resolve_entity_filename(
        exposure_file, country_name, hazard_code, exposure_type
    )
    entity_measures = load_entity_measures(entity_filename)

    if entity_measures is None:
        # No entity to inspect (e.g. picker fired before exposure was
        # picked) — fall back to the raw catalog. The catalog ``name``
        # is also the i18n display key, so ``displayName`` mirrors it.
        measures_list = [
            {
                "id": row.get("id") or row["name"],
                "name": row["name"],
                "displayName": row["name"],
                "is_builtin": bool(row.get("is_builtin", True)),
                "source_reference": row.get("source_reference"),
                "cost_factor": row.get("cost_factor"),
                "hazard_reduction_percentage": row.get("hazard_reduction_percentage"),
            }
            for row in catalog_rows
        ]
    else:
        measures_list = enrich_with_catalog(entity_measures, catalog_rows)

    adaptation_measures = [m["name"] for m in measures_list]
    if not hazard_code or not measures_list:
        status_code = StatusCode.VALIDATION_ERROR
        message = f"No available adaptation measures for {hazard_beautified}."
    else:
        status_code = StatusCode.SUCCESS
        message = f"Fetched adaptation measures for {hazard_beautified} successfully."

    logger.info(f"Finished fetching adaptation measures data in {time() - initial_time:.2f}sec.")
    return {
        "data": {
            "adaptationMeasures": adaptation_measures,
            "measures": measures_list,
        },
        "status": {"code": status_code, "message": message},
    }


@router.get("/measures/{country}/{hazard}", response_model=MeasuresResponse)
async def measures(
    country: str,
    hazard: str,
    measure_set_id: str | None = None,
    exposure_file: str | None = None,
    exposure_type: str | None = None,
) -> dict:
    try:
        return await asyncio.to_thread(
            _fetch_measures_sync,
            country,
            hazard,
            measure_set_id,
            exposure_file,
            exposure_type,
        )
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        logger.error(f"Failed to fetch adaptation measures: {exc}")
        return {
            "data": dict(_EMPTY_MEASURES_DATA),
            "status": {"code": StatusCode.ERROR, "message": str(exc)},
        }


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
