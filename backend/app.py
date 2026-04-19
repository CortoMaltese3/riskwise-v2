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
``docs/architecture-decisions/adr-fastapi-poc.md``.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
import threading
import uuid
from pathlib import Path
from typing import Any

import uvicorn
from cancellation import CancelRequested, cancel_event_var
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from logging_config import (
    bind_request_id,
    configure_logging,
    get_logger,
    request_id_var,
    reset_request_id,
)
from models import (
    CountriesResponse,
    DataValidateRequest,
    DataValidateResponse,
    DeleteReportResponse,
    ErrorResponse,
    ExportReportRequest,
    ExportReportResponse,
    HealthResponse,
    JobAcceptedResponse,
    MacroChartDataRequest,
    MacroChartDataResponse,
    MacroCredOutputResponse,
    MeasuresResponse,
    ReportListResponse,
    ReportResponse,
    SaveScenarioResponse,
    ScenarioRunRequest,
    TempClearResponse,
)
from progress import ProgressEvent, progress_callback_var

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
    from run_scenario import RunScenario

    return RunScenario(payload).run_scenario()


def _dispatch_sync(script_name: str, data: Any) -> dict:
    """Dispatch a legacy ``run_*.py`` script by filename.

    Imports are lazy so that tests (and ``app.py`` itself) can import this
    module without pulling in CLIMADA.
    """
    if script_name == "run_check_data_type.py":
        from run_check_data_type import RunCheckDataType

        return RunCheckDataType(data).run_check_data_type()
    if script_name == "run_fetch_measures.py":
        from run_fetch_measures import RunFetchScenario

        return RunFetchScenario(data).run_fetch_measures()
    if script_name == "run_clear_temp_dir.py":
        from run_clear_temp_dir import RunClearTempDir

        return RunClearTempDir().run_clear_temp_dir()
    if script_name == "run_add_to_ouput.py":
        from run_add_to_ouput import RunAddToOutput

        return RunAddToOutput(data).run_add_to_output()
    if script_name == "run_remove_report.py":
        from run_remove_report import RunRemoveReport

        return RunRemoveReport(data).run_remove_report()
    if script_name == "run_fetch_reports.py":
        from run_fetch_reports import RunFetchReports

        return RunFetchReports().run_fetch_reports()
    if script_name == "run_export_report.py":
        from run_export_report import RunExportReport

        return RunExportReport(data).run_export_report()
    if script_name == "run_fetch_macro_chart_data.py":
        from run_fetch_macro_chart_data import RunFetchMacroChartData

        return RunFetchMacroChartData(data).run_fetch_macro_chart_data()
    if script_name == "run_fetch_cred_output.py":
        from run_fetch_cred_output import RunFetchCredOutput

        return RunFetchCredOutput().run_fetch_cred_output()
    raise ValueError(f"Unknown script: {script_name}")


async def _dispatch(script_name: str, data: Any) -> dict:
    return await asyncio.to_thread(_dispatch_sync, script_name, data)


app = FastAPI(title="RISK WISE Backend", version="2.0.0-dev")


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
        except Exception as exc:
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
async def measures(country: str, hazard: str) -> dict:
    return await _dispatch("run_fetch_measures.py", {"countryName": country, "hazardType": hazard})


@app.get(f"{API_PREFIX}/scenarios", response_model=ReportListResponse)
async def list_scenarios() -> dict:
    return await _dispatch("run_fetch_reports.py", None)


@app.get(f"{API_PREFIX}/scenarios/{{scenario_id}}", response_model=ReportResponse)
async def get_scenario(scenario_id: str) -> dict:
    result = await _dispatch("run_fetch_reports.py", None)
    reports = result.get("data", []) or []
    match = next((r for r in reports if r.get("scenario_id") == scenario_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "data": match,
        "status": result.get("status", {"code": 2000, "message": "ok"}),
    }


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/export", response_model=ExportReportResponse)
async def export_scenario(scenario_id: str, payload: ExportReportRequest) -> dict:
    body = {**payload.model_dump(exclude_none=True), "scenarioRunCode": scenario_id}
    return await _dispatch("run_export_report.py", body)


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/save", response_model=SaveScenarioResponse)
async def save_scenario(scenario_id: str) -> dict:
    return await _dispatch("run_add_to_ouput.py", scenario_id)


@app.delete(f"{API_PREFIX}/scenarios/{{scenario_id}}", response_model=DeleteReportResponse)
async def delete_scenario(
    scenario_id: str,
    report_type: str = "output_data",
    image: str | None = None,
) -> dict:
    report: dict = {"id": scenario_id, "type": report_type}
    if image:
        report["image"] = image
    return await _dispatch("run_remove_report.py", {"report": report})


@app.get(f"{API_PREFIX}/macro/cred-output", response_model=MacroCredOutputResponse)
async def macro_cred_output() -> dict:
    return await _dispatch("run_fetch_cred_output.py", None)


@app.post(f"{API_PREFIX}/macro/chart-data", response_model=MacroChartDataResponse)
async def macro_chart_data(payload: MacroChartDataRequest) -> dict:
    return await _dispatch("run_fetch_macro_chart_data.py", payload.model_dump())


@app.get(f"{API_PREFIX}/countries", response_model=CountriesResponse)
async def countries() -> dict:
    import pycountry

    data = [{"code": c.alpha_3, "name": c.name} for c in pycountry.countries]
    return {"data": data, "status": {"code": 2000, "message": "ok"}}


@app.post(f"{API_PREFIX}/temp/clear", response_model=TempClearResponse)
async def temp_clear() -> dict:
    return await _dispatch("run_clear_temp_dir.py", None)


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
