"""Scenario run/cancel/stream, waterfall, cost-benefit, import, and export routes."""

from __future__ import annotations

import asyncio
import json
import shutil
import threading
from pathlib import Path
from time import time
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

import backend.app as _app
from backend.api._envelope import _status_ok
from backend.cancellation import CancelRequested, cancel_event_var
from backend.cli import StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.logging_config import get_logger
from backend.models import (
    CostBenefitResponse,
    JobAcceptedResponse,
    ScenarioExportResponse,
    ScenarioImportRequest,
    ScenarioImportResponse,
    ScenarioRunRequest,
    WaterfallResponse,
)
from backend.progress import ProgressEvent, progress_callback_var

router = APIRouter()
logger = get_logger("backend.api.scenario")


_COSTBEN_EMPTY_DATA: dict = {
    "currency_unit": "",
    "present_year": 0,
    "future_year": 0,
    "measures": [],
}


def _read_persisted_json_payload(
    path: Path,
    *,
    empty_data: Any,
    success_message: str,
    missing_message: str,
    failure_message: str,
) -> dict:
    """Return the on-disk JSON envelope written by the scenario runner.

    ``empty_data`` is the schema-shaped placeholder returned when the file
    is absent or unreadable — ``WaterfallPayload.categories`` enforces
    ``min_length=4`` so waterfall passes ``None`` rather than an empty
    dict to keep Pydantic response validation happy.
    """
    initial_time = time()
    if not path.exists():
        logger.info(missing_message)
        return {
            "data": empty_data,
            "status": {"code": StatusCode.ERROR, "message": missing_message},
        }
    try:
        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, ValueError) as exc:
        message = f"{failure_message} More info: {exc}"
        logger.error(message)
        return {
            "data": empty_data,
            "status": {"code": StatusCode.ERROR, "message": message},
        }
    logger.info(f"{success_message} ({time() - initial_time:.2f} sec)")
    return {
        "data": payload,
        "status": {"code": StatusCode.SUCCESS, "message": success_message},
    }


# Sentinel posted to a job queue to close the SSE stream.
_STREAM_END = object()


@router.post("/scenario/run", response_model=JobAcceptedResponse)
async def scenario_run(payload: ScenarioRunRequest) -> dict:
    if _app._active_job_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Another scenario is already running",
        )

    # ERA-mode runs are strict about provenance: the canonical impact
    # functions are the answer of record, so an override on an ERA run
    # would silently break that contract. Custom mode is where edits
    # belong (#453, DECISIONS D28). Reject at the boundary so the runner
    # never has to second-guess the input.
    if payload.impactFunctionOverride is not None and payload.isEra:
        raise HTTPException(
            status_code=400,
            detail="impactFunctionOverride is not allowed on ERA-mode runs",
        )

    # Server-side validation runs against the registry's scientific rules
    # so a renderer that bypasses the editor's client-side checks still
    # cannot push a non-monotonic curve into the engine.
    if payload.impactFunctionOverride is not None:
        from backend.impact.validator import validate_impact_function_override

        errors = validate_impact_function_override(payload.impactFunctionOverride.model_dump())
        if errors:
            envelope = _app._make_error(
                "validation_error",
                "impactFunctionOverride failed validation",
            )
            envelope["errors"] = [
                {"field": e.field, "code": e.code, "message": e.message} for e in errors
            ]
            return JSONResponse(status_code=400, content=envelope)

    ok, msg = _app._check_memory_preflight()
    if not ok:
        raise HTTPException(status_code=413, detail=msg)

    job_id, queue, cancel_event = _app.jobs.create()
    _app._active_job_id = job_id
    asyncio.create_task(
        _execute_scenario(job_id, payload.model_dump(exclude_none=False), queue, cancel_event)
    )
    return {"job_id": job_id}


@router.post("/scenario/{job_id}/cancel")
async def scenario_cancel(job_id: str) -> dict:
    cancel_event = _app.jobs.get_cancel_event(job_id)
    if cancel_event is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    cancel_event.set()
    # Cancelled runs may have partial CLIMADA objects pinned in the LRU
    # caches from the aborted load path; drop them so the next run starts
    # from a clean slate rather than reusing a half-initialised entity.
    from backend.cache import clear_all as _clear_object_caches

    _clear_object_caches()
    return {"status": "ok", "cancelled": True, "job_id": job_id}


@router.get("/scenario/{job_id}/stream")
async def scenario_stream(job_id: str) -> StreamingResponse:
    queue = _app.jobs.get_queue(job_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    cancel_event = _app.jobs.get_cancel_event(job_id)

    async def _gen():
        try:
            while True:
                event = await queue.get()
                if event is _STREAM_END:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            # If the client disconnects mid-run, set the cancel flag so the
            # worker aborts at its next checkpoint instead of finishing a
            # computation whose result nobody is listening for. Setting it
            # after a clean completion is harmless because the worker has
            # already exited the cancel-checking region.
            if cancel_event is not None:
                cancel_event.set()
            _app.jobs.remove(job_id)

    return StreamingResponse(_gen(), media_type="text/event-stream")


async def _execute_scenario(
    job_id: str,
    payload: dict,
    queue: asyncio.Queue,
    cancel_event: threading.Event,
) -> None:
    loop = asyncio.get_running_loop()

    def publish(event: ProgressEvent) -> None:
        # ``update_progress`` is invoked from a worker thread via CLIMADA;
        # asyncio.Queue is not thread-safe, so marshal back to the loop.
        loop.call_soon_threadsafe(queue.put_nowait, event)

    progress_token = progress_callback_var.set(publish)
    cancel_token = cancel_event_var.set(cancel_event)
    try:
        try:
            result = await asyncio.to_thread(_app._run_scenario_sync, payload)
            queue.put_nowait({"type": "result", "data": result})
        except CancelRequested:
            queue.put_nowait(
                {
                    "type": "cancelled",
                    **_app._make_error("cancelled", "Scenario run was cancelled"),
                }
            )
        except Exception as exc:  # noqa: BLE001 - SSE stream isolation boundary
            # Scenario 5: CLIMADA blew up but FastAPI must stay alive. The
            # structured error goes out on the SSE stream; no other job is
            # affected because we never share state across jobs.
            queue.put_nowait(
                {
                    "type": "error",
                    **_app._make_error("scenario_error", "Scenario run failed", str(exc)),
                }
            )
    finally:
        progress_callback_var.reset(progress_token)
        cancel_event_var.reset(cancel_token)
        queue.put_nowait(_STREAM_END)
        _app._active_job_id = None


@router.get("/scenario/waterfall", response_model=WaterfallResponse)
async def scenario_waterfall() -> dict:
    # Deferred import — :mod:`backend.costben.costben_handler` transitively
    # pulls in geopandas via the hazard handler. The integration suite stubs
    # geopandas only when a route is actually invoked, so leaving this at
    # module top would break import of :mod:`backend.app` in vanilla envs.
    from backend.costben.costben_handler import WATERFALL_DATA_FILENAME

    return await asyncio.to_thread(
        _read_persisted_json_payload,
        DATA_TEMP_DIR / WATERFALL_DATA_FILENAME,
        # ``data`` is ``None`` (not an empty dict) because
        # ``WaterfallPayload.categories`` enforces ``min_length=4`` —
        # an empty list there would trip Pydantic response validation
        # and surface as a 500 to the renderer instead of the intended
        # graceful "no waterfall yet" status.
        empty_data=None,
        success_message="Waterfall data fetched successfully.",
        missing_message="Waterfall data not available. Run a future scenario first.",
        failure_message="Failed to read waterfall data.",
    )


@router.get("/scenario/cost-benefit", response_model=CostBenefitResponse)
async def scenario_cost_benefit() -> dict:
    from backend.costben.costben_handler import COSTBEN_DATA_FILENAME

    return await asyncio.to_thread(
        _read_persisted_json_payload,
        DATA_TEMP_DIR / COSTBEN_DATA_FILENAME,
        empty_data=dict(_COSTBEN_EMPTY_DATA),
        success_message="Cost-benefit data fetched successfully.",
        missing_message=(
            "Cost-benefit data not available. Run a scenario with adaptation measures first."
        ),
        failure_message="Failed to read cost-benefit data.",
    )


# Two flavours of the scenario export endpoint live side by side:
#   - GET /scenario/{id}/export streams the ZIP with Content-Disposition:
#     attachment — the literal acceptance criterion, and what a curl-driven
#     integration test sees.
#   - GET /scenario/{id}/export-data returns a tempfile path so the Electron
#     main process can copy the bundle to the user-chosen save location and
#     unlink the source.


async def _build_scenario_export(scenario_id: str) -> tuple[Path, str]:
    """Run :func:`build_export_to_temp` off the loop and translate not-found to 404."""
    from backend.export_handler import ScenarioExportError, build_export_to_temp

    try:
        return await asyncio.to_thread(build_export_to_temp, scenario_id)
    except ScenarioExportError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/scenario/{scenario_id}/export")
async def scenario_export_stream(scenario_id: str) -> FileResponse:
    """Stream the ``.riskwise-scenario`` ZIP for direct download.

    Cleanup runs via Starlette's ``BackgroundTask`` after the response
    completes successfully. A client that drops mid-download leaves the
    temp dir behind — acceptable for a manually-triggered single-scenario
    export at this scale; a periodic sweep can reap stragglers if needed.
    """
    output_path, suggested_filename = await _build_scenario_export(scenario_id)

    def _cleanup() -> None:
        shutil.rmtree(output_path.parent, ignore_errors=True)

    return FileResponse(
        path=str(output_path),
        media_type="application/zip",
        filename=suggested_filename,
        background=BackgroundTask(_cleanup),
    )


@router.get("/scenario/{scenario_id}/export-data", response_model=ScenarioExportResponse)
async def scenario_export_data(scenario_id: str) -> dict:
    """Build a ``.riskwise-scenario`` at a temp path and return its location."""
    output_path, suggested_filename = await _build_scenario_export(scenario_id)
    return {
        "data": {
            "export_path": str(output_path),
            "filename": suggested_filename,
            "scenario_id": scenario_id,
        },
        "status": _status_ok(),
    }


@router.post("/scenario/import", response_model=ScenarioImportResponse)
async def scenario_import(payload: ScenarioImportRequest) -> dict:
    from backend.export_handler import ScenarioImportError, import_scenario

    try:
        result = await asyncio.to_thread(import_scenario, Path(payload.import_path))
    except ScenarioImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": result, "status": _status_ok()}
