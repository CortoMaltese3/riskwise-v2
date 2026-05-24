"""RISK WISE backend FastAPI server on loopback HTTP — assembly module.

Per-domain ``APIRouter`` modules under :mod:`backend.api` own the route
definitions; this file wires them into the app and owns the cross-cutting
concerns: lifespan, CORS, request-id middleware, exception handlers, the
job registry, the legacy dispatcher, and the ``run`` entrypoint that
binds an ephemeral loopback port and emits the ``ready`` event Electron
reads from stdout.

See ``docs/DECISIONS.md`` D02 and D16, ``docs/spikes/adr-fastapi-poc.md``,
and issue #12 (structured error envelope, cancellation, memory pre-flight).
"""

from __future__ import annotations

import asyncio
import json
import os
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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api._dispatch import _dispatch_sync
from backend.constants import BASE_DIR, DATA_MANIFEST_PATH, REQUIREMENTS_DIR
from backend.db import run_startup_migrations
from backend.logging_config import (
    bind_request_id,
    configure_logging,
    get_logger,
    request_id_var,
    reset_request_id,
)
from backend.models import ErrorResponse
from backend.models.errors import RiskWiseError
from backend.provenance import ManifestError, verify_manifest

API_PREFIX = "/api/v1"

# Header the Electron main process uses to propagate the renderer-generated
# correlation UUID; the middleware fabricates one when absent.
REQUEST_ID_HEADER = "X-Request-ID"

# Conservative 2 GB floor: CLIMADA hazard+exposure loads commonly peak above
# 1.5 GB, and an explicit constant lets us tune without hunting magic numbers.
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

# Single in-flight scenario job, if any. Race-free under FastAPI's single
# event loop: the check-then-set in the scenario router has no intervening
# ``await``. The router mutates this via ``backend.app._active_job_id`` so
# tests can reset it between cases.
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
        # psutil is a hard runtime dep in the bundled engine; dev
        # environments without it skip the check rather than refuse every run.
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


async def _dispatch(script_name: str, data: Any) -> dict:
    # Module-global ``_dispatch_sync`` lookup so test_app.py's
    # ``patch.object(app_module, "_dispatch_sync", ...)`` intercepts dispatch.
    return await asyncio.to_thread(_dispatch_sync, script_name, data)


def _verify_shipped_data_manifest() -> None:
    """Check every entry in ``data/manifest.json`` against its SHA on disk.

    Fatal on mismatch: tampered seed data would produce silently-wrong
    scenarios. Set ``RISKWISE_SKIP_MANIFEST_VERIFY=1`` in dev environments
    that ship without the full data tree.
    """
    api_log = get_logger("api")
    try:
        verify_manifest(DATA_MANIFEST_PATH, BASE_DIR)
    except ManifestError as exc:
        api_log.error("startup.manifest_failed", error=str(exc))
        raise


def _scan_user_data_countries() -> None:
    """Build the custom-country registry once at startup.

    Namespace collisions (custom drop-in shadows a built-in ISO3) raise
    ``ExtensibilityError`` and abort the process (issue #56 scenario 2).
    Per-entry schema errors are non-fatal — logged and skipped.
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
_MEASURES_JSON_PATH = REQUIREMENTS_DIR / "adaptation_measures.json"


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Ordering matters: manifest before migrations (tampered build aborts
    # before touching the scenario DB); custom-country scan before serving
    # any /countries request; migrations before any endpoint is served.
    _verify_shipped_data_manifest()
    _scan_user_data_countries()
    run_startup_migrations()
    # Idempotent seeds — skipped via env vars in test fixtures that
    # pre-seed their own DB.
    if not os.getenv("RISKWISE_SKIP_CRED_SEED"):
        from backend.macroeconomic.cred_seeder import run_startup_cred_seed

        run_startup_cred_seed(_CRED_XLSX_PATH)
    if not os.getenv("RISKWISE_SKIP_MEASURES_SEED"):
        from backend.measures.measures_seeder import run_startup_measures_seed

        run_startup_measures_seed(_MEASURES_JSON_PATH)
    yield


app = FastAPI(title="RISK WISE Backend", version="2.0.0-dev", lifespan=_lifespan)

# Scoped to the renderer's print BrowserWindow (``app://.``) which is the
# only origin doing cross-origin ``fetch()`` for snapshot bytes; every other
# backend call routes through preload IPC. See ``ScenarioPrintView``.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["app://."],
    allow_methods=["GET"],
)


@app.middleware("http")
async def _request_id_middleware(request: Request, call_next):
    """Bind the request-ID contextvar for the request lifetime.

    The header is the Electron main process's contract for propagating the
    renderer-generated UUID; if absent we fabricate one and echo it back so
    every log line has a usable value. The logger is resolved per-call so
    ``configure_logging`` can rewire the output stream in tests.
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
    # Architecture rule #7: every ``RiskWiseError`` carries a stable
    # ``code`` + ``http_status`` so the frontend switches on snake_case.
    return JSONResponse(
        status_code=exc.http_status,
        content=_make_error(exc.code, exc.message, str(exc) if str(exc) != exc.message else None),
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_make_error("internal_error", "Internal server error", str(exc)),
    )


# Routers import AFTER the helpers above so each router's
# ``import backend.app as _app`` lookup hits a fully populated module.
from backend.api import (  # noqa: E402
    custom_data,
    macro,
    measures,
    scenario,
    scenarios,
    settings,
    snapshots,
    workspace,
)

app.include_router(settings.router, prefix=API_PREFIX)
app.include_router(scenario.router, prefix=API_PREFIX)
app.include_router(scenarios.router, prefix=API_PREFIX)
app.include_router(snapshots.router, prefix=API_PREFIX)
app.include_router(measures.router, prefix=API_PREFIX)
app.include_router(macro.router, prefix=API_PREFIX)
app.include_router(custom_data.router, prefix=API_PREFIX)
app.include_router(workspace.router, prefix=API_PREFIX)


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
    # Sentry must init before ``configure_logging`` so the LoggingIntegration
    # handler is wired before the first startup INFO line (no-op without
    # SENTRY_DSN; privacy gate is in ``public/electron.js``).
    from backend.sentry_init import init_sentry

    init_sentry()

    # Honour LOG_DIR from the Electron main (``userData/logs``) so Python
    # logs land next to electron-log's files for support-bundle zips.
    log_dir_env = os.getenv("LOG_DIR")
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
