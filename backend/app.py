"""RISK WISE backend FastAPI server on loopback HTTP.

Replaces the legacy stdin/stdout IPC channel with a FastAPI + uvicorn server
bound to ``127.0.0.1:0``. On startup the process prints a single line to
stdout::

    {"type":"event","name":"ready","port":N}

Electron reads that line to learn the ephemeral port, then calls every
endpoint over HTTP. Scenario runs stream progress over
``text/event-stream`` (SSE) and the final result on the same stream.

Pydantic models live in ``backend/models/`` and are wired here as both
request bodies and ``response_model`` so that the OpenAPI schema (and the
TypeScript client generated from it) stays in sync with the runtime.

Error handling (issue #12):
    - Every non-2xx response is a structured :class:`ErrorResponse` with a
      UUID ``error_id`` the renderer surfaces to the user.
    - A single-job invariant is enforced up front: a second ``POST
      /scenario/run`` while one is in flight fails fast with ``409`` rather
      than queueing behind the lock.
    - Cancellation is cooperative via :mod:`cancellation`: the SSE stream's
      cleanup (or an explicit ``POST /scenario/{id}/cancel``) sets a
      ``threading.Event`` that CLIMADA step boundaries poll.
    - A pre-flight memory check rejects the run before CLIMADA allocates
      anything so the OS does not OOM-kill the worker mid-run.

See ``docs/DECISIONS.md`` D02 and D16 and
``docs/spikes/adr-fastapi-poc.md``.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import sys
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from backend.cancellation import CancelRequested, cancel_event_var
from backend.constants import BASE_DIR, DATA_MANIFEST_PATH, REQUIREMENTS_DIR
from backend.db import run_startup_migrations
from backend.logging_config import (
    bind_request_id,
    configure_logging,
    get_logger,
    request_id_var,
    reset_request_id,
)
from backend.models import (
    CostBenefitResponse,
    CountriesResponse,
    CreateSnapshotRequest,
    CreateSnapshotResponse,
    CredDatasetDeleteResponse,
    CredDatasetsResponse,
    CredDatasetUploadRequest,
    CredDatasetUploadResponse,
    CustomDataDeleteResponse,
    CustomDataImportRequest,
    CustomDataImportResponse,
    CustomDataListResponse,
    CustomDataValidateRequest,
    CustomDataValidateResponse,
    DataValidateRequest,
    DataValidateResponse,
    DeleteScenarioResponse,
    DeleteSnapshotResponse,
    ErrorResponse,
    ExportReportRequest,
    ExportReportResponse,
    HealthResponse,
    JobAcceptedResponse,
    MacroChartDataRequest,
    MacroChartDataResponse,
    MacroCredOutputResponse,
    MeasureSetDeleteResponse,
    MeasureSetsResponse,
    MeasureSetUploadRequest,
    MeasureSetUploadResponse,
    MeasuresResponse,
    PatchScenarioRequest,
    SaveScenarioRequest,
    SaveScenarioResponse,
    ScenarioDetailResponse,
    ScenarioExportResponse,
    ScenarioImportRequest,
    ScenarioImportResponse,
    ScenarioListResponse,
    ScenarioRunRequest,
    SnapshotListResponse,
    TempClearResponse,
    UpdateSnapshotRequest,
    UpdateSnapshotResponse,
    UpdateUserSettingsRequest,
    UserSettingsResponse,
    WaterfallResponse,
    WorkspaceExportResponse,
    WorkspaceImportRequest,
    WorkspaceImportResponse,
)
from backend.models.errors import RiskWiseError
from backend.progress import ProgressEvent, progress_callback_var
from backend.provenance import ManifestError, verify_manifest
from backend.uploads import enforce_upload_size_limit

API_PREFIX = "/api/v1"

# Header used by the Electron main process to propagate the correlation UUID
# generated in the renderer. When absent (e.g., a direct curl) the middleware
# fabricates one so every log line still has a non-empty ``request_id``.
REQUEST_ID_HEADER = "X-Request-ID"

# Sentinel posted to a job queue to close the SSE stream.
_STREAM_END = object()

# Pre-flight memory gate: refuse to start a scenario if the OS is likely to
# OOM-kill the worker. The minimum is intentionally conservative (2 GB) —
# CLIMADA's hazard and exposure loads commonly peak above 1.5 GB, and holding
# an explicit constant here lets us tune the threshold without hunting for
# magic numbers.
MEMORY_PREFLIGHT_MIN_AVAILABLE_BYTES = 2 * 1024 * 1024 * 1024


class _JobRegistry:
    """Tracks in-flight scenario jobs, their SSE queues, and cancel events."""

    def __init__(self) -> None:
        self._jobs: dict[str, tuple[asyncio.Queue, threading.Event]] = {}

    def create(self) -> tuple[str, asyncio.Queue, threading.Event]:
        job_id = str(uuid.uuid4())
        queue: asyncio.Queue = asyncio.Queue()
        cancel_event = threading.Event()
        self._jobs[job_id] = (queue, cancel_event)
        return job_id, queue, cancel_event

    def get_queue(self, job_id: str) -> asyncio.Queue | None:
        entry = self._jobs.get(job_id)
        return entry[0] if entry else None

    def get_cancel_event(self, job_id: str) -> threading.Event | None:
        entry = self._jobs.get(job_id)
        return entry[1] if entry else None

    def remove(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)


jobs = _JobRegistry()

# Tracks the single in-flight scenario job, if any. FastAPI runs on one event
# loop so a plain attribute is race-free: the check-then-set in
# ``scenario_run`` happens without an intervening ``await`` where another
# coroutine could slip through.
_active_job_id: str | None = None


def _make_error(
    code: str, message: str, detail: str | None = None, error_id: str | None = None
) -> dict:
    current_request_id = request_id_var.get()
    return ErrorResponse(
        code=code,
        message=message,
        detail=detail,
        error_id=error_id or str(uuid.uuid4()),
        request_id=current_request_id if current_request_id != "-" else None,
    ).model_dump()


def _check_memory_preflight() -> tuple[bool, str]:
    """Return ``(ok, message)`` based on currently-available system memory."""
    try:
        import psutil
    except ImportError:
        # psutil is a hard runtime dep in the bundled engine; in dev
        # environments without it we skip the check rather than refuse
        # every run.
        return True, ""
    vm = psutil.virtual_memory()
    if vm.available < MEMORY_PREFLIGHT_MIN_AVAILABLE_BYTES:
        return False, (
            f"Insufficient memory: {vm.available // (1024 * 1024)} MB available, "
            f"{MEMORY_PREFLIGHT_MIN_AVAILABLE_BYTES // (1024 * 1024)} MB required"
        )
    return True, ""


def _run_scenario_sync(payload: dict) -> dict:
    """Import and execute the legacy scenario runner. Called inside a thread."""
    from backend.run_scenario import RunScenario

    return RunScenario(payload).run_scenario()


def _dispatch_sync(script_name: str, data: Any) -> dict:
    """Dispatch a legacy ``run_*.py`` script by filename.

    Imports are lazy so that tests (and ``app.py`` itself) can import this
    module without pulling in CLIMADA.
    """
    if script_name == "run_check_data_type.py":
        from backend.run_check_data_type import RunCheckDataType

        return RunCheckDataType(data).run_check_data_type()
    if script_name == "run_fetch_measures.py":
        from backend.run_fetch_measures import RunFetchScenario

        return RunFetchScenario(data).run_fetch_measures()
    if script_name == "run_clear_temp_dir.py":
        from backend.run_clear_temp_dir import RunClearTempDir

        return RunClearTempDir().run_clear_temp_dir()
    if script_name == "run_export_report.py":
        from backend.run_export_report import RunExportReport

        return RunExportReport(data).run_export_report()
    if script_name == "run_fetch_macro_chart_data.py":
        from backend.run_fetch_macro_chart_data import RunFetchMacroChartData

        return RunFetchMacroChartData(data).run_fetch_macro_chart_data()
    if script_name == "run_fetch_cred_output.py":
        from backend.run_fetch_cred_output import RunFetchCredOutput

        ds = None
        if isinstance(data, dict):
            ds = data.get("dataset_id")
        return RunFetchCredOutput(dataset_id=ds).run_fetch_cred_output()
    if script_name == "run_fetch_waterfall.py":
        from backend.run_fetch_waterfall import RunFetchWaterfall

        return RunFetchWaterfall().run_fetch_waterfall()
    if script_name == "run_fetch_costbenefit.py":
        from backend.run_fetch_costbenefit import RunFetchCostBenefit

        return RunFetchCostBenefit().run_fetch_costbenefit()
    raise ValueError(f"Unknown script: {script_name}")


async def _dispatch(script_name: str, data: Any) -> dict:
    return await asyncio.to_thread(_dispatch_sync, script_name, data)


def _verify_shipped_data_manifest() -> None:
    """Check every entry in ``data/manifest.json`` against its SHA on disk.

    A mismatch is fatal: tampered or missing seed data would produce
    silently-wrong scenarios. We log a structured error so the Electron
    shell can surface it and exit with a non-zero code. The manifest file
    itself not being present is also fatal in production; set
    ``RISKWISE_SKIP_MANIFEST_VERIFY=1`` in dev environments that ship
    without the full data tree.
    """
    api_log = get_logger("api")
    try:
        verify_manifest(DATA_MANIFEST_PATH, BASE_DIR)
    except ManifestError as exc:
        api_log.error("startup.manifest_failed", error=str(exc))
        raise


def _scan_user_data_countries() -> None:
    """Build the custom-country registry once at startup.

    Namespace collisions (a custom drop-in that shadows a built-in ISO3)
    raise :class:`extensibility.ExtensibilityError` and abort the process
    — this is the structured error Scenario 2 of issue #56 requires. Per-
    entry schema errors are non-fatal: they are logged as warnings and
    the rest of the registry still loads.
    """
    from backend.extensibility.registry import CountrySource
    from backend.extensibility.registry import get_registry as get_country_registry

    api_log = get_logger("api")
    registry = get_country_registry()
    for iso3, message in registry.errors:
        api_log.warning("extensibility.custom_country_skipped", iso3=iso3, error=message)
    api_log.info(
        "extensibility.registry_loaded",
        builtin=sum(1 for c in registry.countries if c.source is CountrySource.BUILTIN),
        custom=sum(1 for c in registry.countries if c.source is CountrySource.CUSTOM),
        skipped=len(registry.errors),
    )


_CRED_XLSX_PATH = REQUIREMENTS_DIR / "cred_output.xlsx"
_MEASURES_XLSX_PATH = REQUIREMENTS_DIR / "adaptation_measures.xlsx"


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Manifest verification runs before migrations so a tampered build
    # aborts the process before it touches the user's scenario DB.
    _verify_shipped_data_manifest()
    # Scan user-data early so a namespace collision (custom country that
    # shadows a built-in ISO3) aborts startup with a clear error instead
    # of surfacing lazily on the first /api/v1/countries request.
    _scan_user_data_countries()
    # DuckDB migrations must complete before any endpoint is served;
    # otherwise the first request could hit a half-built schema.
    run_startup_migrations()
    # Seed the built-in CRED dataset; idempotent — skips if already present.
    # Set RISKWISE_SKIP_CRED_SEED=1 in test fixtures that pre-seed their own DB.
    if not os.getenv("RISKWISE_SKIP_CRED_SEED"):
        from backend.macroeconomic.cred_seeder import run_startup_cred_seed

        run_startup_cred_seed(_CRED_XLSX_PATH)
    # Seed the built-in adaptation measures; idempotent — skips if already present.
    # Set RISKWISE_SKIP_MEASURES_SEED=1 in test fixtures that pre-seed their own DB.
    if not os.getenv("RISKWISE_SKIP_MEASURES_SEED"):
        from backend.measures.measures_seeder import run_startup_measures_seed

        run_startup_measures_seed(_MEASURES_XLSX_PATH)
    yield


app = FastAPI(title="RISK WISE Backend", version="2.0.0-dev", lifespan=_lifespan)


@app.middleware("http")
async def _request_id_middleware(request: Request, call_next):
    """Bind the request-ID contextvar for the lifetime of the request.

    The header is the contract the Electron main process uses to propagate
    the renderer-generated UUID. If the header is missing we fabricate one
    so every log line has a usable value, and we echo it back on the
    response so a caller can always retrieve what was logged.

    The logger is resolved per-call (rather than bound at module import) so
    ``configure_logging`` can rewire the output stream in tests without the
    middleware keeping a proxy bound to the stale ``structlog`` default.
    """
    request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
    token = bind_request_id(request_id)
    api_log = get_logger("api")
    try:
        api_log.info(
            "request.start",
            method=request.method,
            path=request.url.path,
        )
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        api_log.info(
            "request.end",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
        )
        return response
    finally:
        reset_request_id(token)


_HTTP_CODE_TO_ERROR_CODE = {
    404: "not_found",
    409: "job_conflict",
    413: "memory_insufficient",
    422: "validation_error",
    503: "backend_unavailable",
}


@app.exception_handler(HTTPException)
async def _http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = _HTTP_CODE_TO_ERROR_CODE.get(exc.status_code, "http_error")
    detail = exc.detail if isinstance(exc.detail, str) else None
    message = detail or f"HTTP {exc.status_code}"
    return JSONResponse(status_code=exc.status_code, content=_make_error(code, message, detail))


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_make_error("validation_error", "Invalid request body", str(exc.errors())),
    )


@app.exception_handler(RiskWiseError)
async def _domain_exception_handler(_request: Request, exc: RiskWiseError) -> JSONResponse:
    # Boundary translation for the project's domain exception taxonomy
    # (architecture rule #7): every ``RiskWiseError`` subclass advertises
    # a ``code`` and ``http_status`` so the frontend switches on a stable
    # snake_case identifier instead of parsing free-form Python messages.
    return JSONResponse(
        status_code=exc.http_status,
        content=_make_error(exc.code, exc.message, str(exc) if str(exc) != exc.message else None),
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    # Scenario 5 (job isolation): any unhandled exception from a handler
    # becomes a structured response so FastAPI itself stays alive.
    return JSONResponse(
        status_code=500,
        content=_make_error("internal_error", "Internal server error", str(exc)),
    )


@app.get(f"{API_PREFIX}/health", response_model=HealthResponse)
async def health() -> dict:
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/settings", response_model=UserSettingsResponse)
async def get_settings_endpoint() -> dict:
    from dataclasses import asdict

    from backend.db import get_user_settings

    row = await asyncio.to_thread(get_user_settings)
    return {"data": asdict(row), "status": _status_ok()}


@app.patch(f"{API_PREFIX}/settings", response_model=UserSettingsResponse)
async def patch_settings_endpoint(payload: UpdateUserSettingsRequest) -> dict:
    from dataclasses import asdict

    from backend.db import update_user_settings

    # ``model_fields_set`` lets us distinguish "the client omitted this key"
    # from "the client explicitly sent null"; the store treats _UNSET as
    # "leave column untouched" so a PATCH that only touches the locale never
    # blanks the currency (mirrors the snapshot title/caption pattern in #350).
    kwargs: dict = {}
    if "report_locale" in payload.model_fields_set and payload.report_locale is not None:
        kwargs["report_locale"] = payload.report_locale
    if "report_currency" in payload.model_fields_set and payload.report_currency is not None:
        kwargs["report_currency"] = payload.report_currency
    row = await asyncio.to_thread(update_user_settings, **kwargs)
    return {"data": asdict(row), "status": _status_ok()}


@app.post(f"{API_PREFIX}/scenario/run", response_model=JobAcceptedResponse)
async def scenario_run(payload: ScenarioRunRequest) -> dict:
    global _active_job_id
    if _active_job_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Another scenario is already running",
        )

    ok, msg = _check_memory_preflight()
    if not ok:
        raise HTTPException(status_code=413, detail=msg)

    job_id, queue, cancel_event = jobs.create()
    _active_job_id = job_id
    asyncio.create_task(
        _execute_scenario(job_id, payload.model_dump(exclude_none=False), queue, cancel_event)
    )
    return {"job_id": job_id}


@app.post(f"{API_PREFIX}/scenario/{{job_id}}/cancel")
async def scenario_cancel(job_id: str) -> dict:
    cancel_event = jobs.get_cancel_event(job_id)
    if cancel_event is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    cancel_event.set()
    # Cancelled runs may have partial CLIMADA objects pinned in the LRU
    # caches from the aborted load path; drop them so the next run starts
    # from a clean slate rather than reusing a half-initialised entity.
    from backend.cache import clear_all as _clear_object_caches

    _clear_object_caches()
    return {"status": "ok", "cancelled": True, "job_id": job_id}


@app.get(f"{API_PREFIX}/scenario/{{job_id}}/stream")
async def scenario_stream(job_id: str) -> StreamingResponse:
    queue = jobs.get_queue(job_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    cancel_event = jobs.get_cancel_event(job_id)

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
            jobs.remove(job_id)

    return StreamingResponse(_gen(), media_type="text/event-stream")


async def _execute_scenario(
    job_id: str,
    payload: dict,
    queue: asyncio.Queue,
    cancel_event: threading.Event,
) -> None:
    global _active_job_id
    loop = asyncio.get_running_loop()

    def publish(event: ProgressEvent) -> None:
        # ``update_progress`` is invoked from a worker thread via CLIMADA;
        # asyncio.Queue is not thread-safe, so marshal back to the loop.
        loop.call_soon_threadsafe(queue.put_nowait, event)

    progress_token = progress_callback_var.set(publish)
    cancel_token = cancel_event_var.set(cancel_event)
    try:
        try:
            result = await asyncio.to_thread(_run_scenario_sync, payload)
            queue.put_nowait({"type": "result", "data": result})
        except CancelRequested:
            queue.put_nowait(
                {
                    "type": "cancelled",
                    **_make_error("cancelled", "Scenario run was cancelled"),
                }
            )
        except Exception as exc:  # noqa: BLE001 - SSE stream isolation boundary
            # Scenario 5: CLIMADA blew up but FastAPI must stay alive. The
            # structured error goes out on the SSE stream; no other job is
            # affected because we never share state across jobs.
            queue.put_nowait(
                {
                    "type": "error",
                    **_make_error("scenario_error", "Scenario run failed", str(exc)),
                }
            )
    finally:
        progress_callback_var.reset(progress_token)
        cancel_event_var.reset(cancel_token)
        queue.put_nowait(_STREAM_END)
        _active_job_id = None


@app.post(f"{API_PREFIX}/data/validate", response_model=DataValidateResponse)
async def data_validate(payload: DataValidateRequest) -> dict:
    return await _dispatch("run_check_data_type.py", payload.model_dump())


@app.get(f"{API_PREFIX}/measures/{{country}}/{{hazard}}", response_model=MeasuresResponse)
async def measures(country: str, hazard: str, measure_set_id: str | None = None) -> dict:
    payload: dict = {"countryName": country, "hazardType": hazard}
    if measure_set_id is not None:
        payload["measureSetId"] = measure_set_id
    return await _dispatch("run_fetch_measures.py", payload)


@app.get(f"{API_PREFIX}/measures/datasets", response_model=MeasureSetsResponse)
async def measure_datasets() -> dict:
    from backend.db.measures_store import list_measure_sets

    datasets = await asyncio.to_thread(list_measure_sets)
    return {"data": datasets, "status": _status_ok()}


@app.post(f"{API_PREFIX}/measures/datasets", response_model=MeasureSetUploadResponse)
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


@app.delete(
    f"{API_PREFIX}/measures/datasets/{{measure_set_id}}",
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


def _status_ok() -> dict:
    return {"code": 2000, "message": "ok"}


def _scenario_row_to_dict(row: Any) -> dict:
    from dataclasses import asdict

    return asdict(row)


@app.get(f"{API_PREFIX}/scenarios", response_model=ScenarioListResponse)
async def list_scenarios_endpoint() -> dict:
    from backend.db import list_scenarios

    rows = await asyncio.to_thread(list_scenarios)
    return {"data": [_scenario_row_to_dict(r) for r in rows], "status": _status_ok()}


@app.get(f"{API_PREFIX}/scenarios/{{scenario_id}}", response_model=ScenarioDetailResponse)
async def get_scenario_endpoint(scenario_id: str) -> dict:
    from backend.db import get_scenario

    detail = await asyncio.to_thread(get_scenario, scenario_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "data": {
            "scenario": _scenario_row_to_dict(detail.scenario),
            "results": detail.results,
        },
        "status": _status_ok(),
    }


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/export", response_model=ExportReportResponse)
async def export_scenario(scenario_id: str, payload: ExportReportRequest) -> dict:
    if payload.exportType == "excel":
        body = {**payload.model_dump(exclude_none=True), "scenarioRunCode": scenario_id}
        return await _dispatch("run_export_report.py", body)
    return {"data": {"status": "delegated_to_electron"}, "status": _status_ok()}


@app.patch(f"{API_PREFIX}/scenarios/{{scenario_id}}", response_model=SaveScenarioResponse)
async def patch_scenario_endpoint(scenario_id: str, payload: PatchScenarioRequest) -> dict:
    from backend.db import patch_scenario_metadata

    row = await asyncio.to_thread(
        patch_scenario_metadata,
        scenario_id,
        name=payload.name,
        tags=payload.tags,
        notes=payload.notes,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": _scenario_row_to_dict(row), "status": _status_ok()}


@app.get(f"{API_PREFIX}/scenarios/{{scenario_id}}/snapshots", response_model=SnapshotListResponse)
async def list_snapshots_endpoint(scenario_id: str) -> dict:
    from dataclasses import asdict

    from backend.db import list_snapshots

    rows = await asyncio.to_thread(list_snapshots, scenario_id)
    return {"data": [asdict(r) for r in rows], "status": _status_ok()}


# Cap on a single uploaded snapshot. Native-resolution map screenshots and
# Chart.js exports are routinely <1 MiB; 10 MiB is a sanity guard that still
# absorbs an oversized retina capture without abusing the DB blob.
_SNAPSHOT_MAX_BYTES = 10 * 1024 * 1024


@app.post(
    f"{API_PREFIX}/scenarios/{{scenario_id}}/snapshots",
    response_model=CreateSnapshotResponse,
)
async def create_snapshot_endpoint(scenario_id: str, payload: CreateSnapshotRequest) -> dict:
    import base64
    import binascii
    from dataclasses import asdict

    from backend.db import ScenarioNotFound, create_snapshot

    try:
        image_bytes = base64.b64decode(payload.image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"image_base64 invalid: {exc}") from exc
    if len(image_bytes) > _SNAPSHOT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="snapshot image exceeds 10 MiB")

    try:
        row = await asyncio.to_thread(
            create_snapshot,
            scenario_id=scenario_id,
            snapshot_type=payload.snapshot_type,
            image=image_bytes,
            title=payload.title,
            caption=payload.caption,
            surface=payload.surface,
        )
    except ScenarioNotFound as exc:
        raise HTTPException(status_code=404, detail="Scenario not found") from exc
    return {"data": asdict(row), "status": _status_ok()}


@app.get(f"{API_PREFIX}/snapshots/{{snapshot_id}}/image")
async def get_snapshot_image_endpoint(snapshot_id: str):
    from fastapi.responses import Response

    from backend.db import get_snapshot_image

    result = await asyncio.to_thread(get_snapshot_image, snapshot_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    image_bytes, mime = result
    return Response(content=image_bytes, media_type=mime)


@app.patch(
    f"{API_PREFIX}/snapshots/{{snapshot_id}}",
    response_model=UpdateSnapshotResponse,
)
async def update_snapshot_endpoint(snapshot_id: str, payload: UpdateSnapshotRequest) -> dict:
    from dataclasses import asdict

    from backend.db import update_snapshot

    # ``model_fields_set`` lets us distinguish "the client omitted this key"
    # from "the client explicitly sent null". Forwarding only the explicit
    # fields means a PATCH that touches only the title leaves the caption
    # untouched (and vice versa) — required by #350 for independent editing.
    kwargs: dict = {}
    if "title" in payload.model_fields_set:
        kwargs["title"] = payload.title
    if "caption" in payload.model_fields_set:
        kwargs["caption"] = payload.caption
    if "surface" in payload.model_fields_set:
        kwargs["surface"] = payload.surface
    row = await asyncio.to_thread(update_snapshot, snapshot_id, **kwargs)
    if row is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"data": asdict(row), "status": _status_ok()}


@app.delete(f"{API_PREFIX}/snapshots/{{snapshot_id}}", response_model=DeleteSnapshotResponse)
async def delete_snapshot_endpoint(snapshot_id: str) -> dict:
    from backend.db import delete_snapshot

    removed = await asyncio.to_thread(delete_snapshot, snapshot_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"data": {"id": snapshot_id}, "status": _status_ok()}


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/save", response_model=SaveScenarioResponse)
async def save_scenario_endpoint(scenario_id: str, payload: SaveScenarioRequest) -> dict:
    from backend.db import update_scenario_metadata

    row = await asyncio.to_thread(
        update_scenario_metadata,
        scenario_id,
        name=payload.name,
        tags=payload.tags,
        notes=payload.notes,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": _scenario_row_to_dict(row), "status": _status_ok()}


@app.delete(f"{API_PREFIX}/scenarios/{{scenario_id}}", response_model=DeleteScenarioResponse)
async def delete_scenario_endpoint(scenario_id: str) -> dict:
    from backend.db import delete_scenario

    removed = await asyncio.to_thread(delete_scenario, scenario_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"data": {"id": scenario_id}, "status": _status_ok()}


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


@app.get(f"{API_PREFIX}/scenario/{{scenario_id}}/export")
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


@app.get(
    f"{API_PREFIX}/scenario/{{scenario_id}}/export-data", response_model=ScenarioExportResponse
)
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


@app.post(f"{API_PREFIX}/scenario/import", response_model=ScenarioImportResponse)
async def scenario_import(payload: ScenarioImportRequest) -> dict:
    from backend.export_handler import ScenarioImportError, import_scenario

    try:
        result = await asyncio.to_thread(import_scenario, Path(payload.import_path))
    except ScenarioImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": result, "status": _status_ok()}


@app.get(f"{API_PREFIX}/macro/datasets", response_model=CredDatasetsResponse)
async def macro_datasets() -> dict:
    from backend.db.cred_store import list_cred_datasets

    datasets = await asyncio.to_thread(list_cred_datasets)
    return {"data": datasets, "status": _status_ok()}


@app.post(f"{API_PREFIX}/macro/datasets", response_model=CredDatasetUploadResponse)
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


@app.delete(f"{API_PREFIX}/macro/datasets/{{dataset_id}}", response_model=CredDatasetDeleteResponse)
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


@app.get(f"{API_PREFIX}/macro/cred-output", response_model=MacroCredOutputResponse)
async def macro_cred_output(dataset_id: str | None = None) -> dict:
    return await _dispatch("run_fetch_cred_output.py", {"dataset_id": dataset_id})


@app.post(f"{API_PREFIX}/macro/chart-data", response_model=MacroChartDataResponse)
async def macro_chart_data(payload: MacroChartDataRequest) -> dict:
    return await _dispatch("run_fetch_macro_chart_data.py", payload.model_dump())


@app.get(f"{API_PREFIX}/scenario/waterfall", response_model=WaterfallResponse)
async def scenario_waterfall() -> dict:
    return await _dispatch("run_fetch_waterfall.py", None)


@app.get(f"{API_PREFIX}/scenario/cost-benefit", response_model=CostBenefitResponse)
async def scenario_cost_benefit() -> dict:
    return await _dispatch("run_fetch_costbenefit.py", None)


@app.get(f"{API_PREFIX}/countries", response_model=CountriesResponse)
async def countries() -> dict:
    """Return the countries RISK WISE can run — built-in plus custom drop-ins.

    Each entry carries a ``source`` field (``"builtin"`` or ``"custom"``)
    so the frontend can label them distinctly (issue #56, Scenario 2).
    Invalid custom drop-ins are skipped at startup (see
    :func:`_scan_user_data_countries`) and do not appear here.
    """
    from backend.extensibility.registry import get_registry as get_country_registry

    registry = get_country_registry()
    data = [
        {"code": entry.code, "name": entry.name, "source": entry.source.value}
        for entry in registry.countries
    ]
    return {"data": data, "status": {"code": 2000, "message": "ok"}}


@app.post(f"{API_PREFIX}/temp/clear", response_model=TempClearResponse)
async def temp_clear() -> dict:
    return await _dispatch("run_clear_temp_dir.py", None)


@app.post(f"{API_PREFIX}/custom-data/validate", response_model=CustomDataValidateResponse)
async def custom_data_validate(payload: CustomDataValidateRequest) -> dict:
    from backend.custom_data_handler import validate_pack

    data = await asyncio.to_thread(validate_pack, Path(payload.zip_path))
    return {"data": data, "status": _status_ok()}


@app.post(f"{API_PREFIX}/custom-data/import", response_model=CustomDataImportResponse)
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


@app.get(f"{API_PREFIX}/custom-data", response_model=CustomDataListResponse)
async def custom_data_list() -> dict:
    from backend.custom_data_handler import list_custom_countries

    countries_list = await asyncio.to_thread(list_custom_countries)
    return {"data": {"countries": countries_list}, "status": _status_ok()}


@app.delete(f"{API_PREFIX}/custom-data/{{iso3}}", response_model=CustomDataDeleteResponse)
async def custom_data_delete(iso3: str) -> dict:
    from backend.custom_data_handler import CustomDataError, delete_custom_country

    try:
        await asyncio.to_thread(delete_custom_country, iso3)
    except CustomDataError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"data": {"iso3": iso3.upper()}, "status": _status_ok()}


@app.get(f"{API_PREFIX}/workspace/export-data", response_model=WorkspaceExportResponse)
async def workspace_export() -> dict:
    """Build a ``.riskwise-workspace`` ZIP at a temp path and return its location.

    The Electron main process copies the file to the user's chosen save
    location and removes the temp copy afterwards, so the backend never
    needs to stream binary through the IPC channel.
    """
    from backend.workspace_handler import build_export_to_temp

    output_path, manifest = await asyncio.to_thread(build_export_to_temp)
    return {
        "data": {
            "export_path": str(output_path),
            "scenario_count": int(manifest["scenario_count"]),
            "export_date": str(manifest["export_date"]),
            "app_version": str(manifest["app_version"]),
        },
        "status": _status_ok(),
    }


@app.post(f"{API_PREFIX}/workspace/import", response_model=WorkspaceImportResponse)
async def workspace_import(payload: WorkspaceImportRequest) -> dict:
    from backend.workspace_handler import WorkspaceImportError, import_workspace

    try:
        counts = await asyncio.to_thread(import_workspace, Path(payload.import_path))
    except WorkspaceImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": counts, "status": _status_ok()}


@app.post(f"{API_PREFIX}/cache/clear")
async def cache_clear() -> dict:
    """Admin-only reset for the Entity/Hazard LRU and DuckDB computation cache.

    Not surfaced in the UI: intended for support flows that need a
    guaranteed cold repeat of a scenario (e.g. when validating a fix to
    a CLIMADA bug that an old cached result is masking).
    """
    from backend.cache import clear_all as _clear_object_caches
    from backend.db import cache_store

    await asyncio.to_thread(_clear_object_caches)
    await asyncio.to_thread(cache_store.clear)
    return {"data": {"cleared": True}, "status": _status_ok()}


class _ReadyNotifyServer(uvicorn.Server):
    """Prints the ready event with the bound port after uvicorn is listening."""

    async def startup(self, sockets=None):
        await super().startup(sockets)
        if self.should_exit:
            return
        for server in self.servers:
            for sock in server.sockets:
                port = sock.getsockname()[1]
                sys.stdout.write(
                    json.dumps({"type": "event", "name": "ready", "port": port}) + "\n"
                )
                sys.stdout.flush()
                return


def run() -> None:
    """Entrypoint for the bundled engine: bind a free port and serve."""
    log_dir_env = os.getenv("LOG_DIR")
    # Honour the LOG_DIR the Electron main sets to ``app.getPath('userData')/logs``
    # so Python logs land next to electron-log's files, giving support a
    # single directory to zip when collecting diagnostics.
    log_dir = Path(log_dir_env) if log_dir_env else None
    configure_logging(log_dir=log_dir)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))

    config = uvicorn.Config(app, log_level="warning")
    server = _ReadyNotifyServer(config)
    server.run(sockets=[sock])


if __name__ == "__main__":
    run()
