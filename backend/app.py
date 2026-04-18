"""RISK WISE backend FastAPI server on loopback HTTP.

Replaces the legacy stdin/stdout IPC channel with a FastAPI + uvicorn server
bound to ``127.0.0.1:0``. On startup the process prints a single line to
stdout::

    {"type":"event","name":"ready","port":N}

Electron reads that line to learn the ephemeral port, then calls every
endpoint over HTTP. Scenario runs stream progress over
``text/event-stream`` (SSE) and the final result on the same stream.

See ``docs/DECISIONS.md`` D02 and D16 and
``docs/architecture-decisions/adr-fastapi-poc.md``.
"""

from __future__ import annotations

import asyncio
import json
import socket
import sys
import uuid
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from progress import ProgressEvent, progress_callback_var

API_PREFIX = "/api/v1"

# Sentinel posted to a job queue to close the SSE stream.
_STREAM_END = object()


class _JobRegistry:
    """Tracks in-flight scenario jobs and their SSE event queues."""

    def __init__(self) -> None:
        self._jobs: dict[str, asyncio.Queue] = {}

    def create(self) -> tuple[str, asyncio.Queue]:
        job_id = str(uuid.uuid4())
        queue: asyncio.Queue = asyncio.Queue()
        self._jobs[job_id] = queue
        return job_id, queue

    def get(self, job_id: str) -> asyncio.Queue | None:
        return self._jobs.get(job_id)

    def remove(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)


jobs = _JobRegistry()

# CLIMADA clears the shared temp directory at the start of each scenario run,
# so only one run may execute at a time. Cancellation is out of scope here
# and tracked by issue #12.
_scenario_lock = asyncio.Lock()


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


@app.get(f"{API_PREFIX}/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post(f"{API_PREFIX}/scenario/run")
async def scenario_run(payload: dict) -> dict:
    job_id, queue = jobs.create()
    asyncio.create_task(_execute_scenario(job_id, payload, queue))
    return {"job_id": job_id}


@app.get(f"{API_PREFIX}/scenario/{{job_id}}/stream")
async def scenario_stream(job_id: str) -> StreamingResponse:
    queue = jobs.get(job_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    async def _gen():
        try:
            while True:
                event = await queue.get()
                if event is _STREAM_END:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            jobs.remove(job_id)

    return StreamingResponse(_gen(), media_type="text/event-stream")


async def _execute_scenario(job_id: str, payload: dict, queue: asyncio.Queue) -> None:
    loop = asyncio.get_running_loop()

    def publish(event: ProgressEvent) -> None:
        # ``update_progress`` is invoked from a worker thread via CLIMADA;
        # asyncio.Queue is not thread-safe, so marshal back to the loop.
        loop.call_soon_threadsafe(queue.put_nowait, event)

    token = progress_callback_var.set(publish)
    try:
        async with _scenario_lock:
            try:
                result = await asyncio.to_thread(_run_scenario_sync, payload)
                queue.put_nowait({"type": "result", "data": result})
            except Exception as exc:
                queue.put_nowait({"type": "error", "error": str(exc)})
    finally:
        progress_callback_var.reset(token)
        queue.put_nowait(_STREAM_END)


@app.post(f"{API_PREFIX}/data/validate")
async def data_validate(payload: dict) -> dict:
    return await _dispatch("run_check_data_type.py", payload)


@app.get(f"{API_PREFIX}/measures/{{country}}/{{hazard}}")
async def measures(country: str, hazard: str) -> dict:
    return await _dispatch("run_fetch_measures.py", {"countryName": country, "hazardType": hazard})


@app.get(f"{API_PREFIX}/scenarios")
async def list_scenarios() -> dict:
    return await _dispatch("run_fetch_reports.py", None)


@app.get(f"{API_PREFIX}/scenarios/{{scenario_id}}")
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


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/export")
async def export_scenario(scenario_id: str, payload: dict) -> dict:
    body = {**payload, "scenarioRunCode": scenario_id}
    return await _dispatch("run_export_report.py", body)


@app.post(f"{API_PREFIX}/scenarios/{{scenario_id}}/save")
async def save_scenario(scenario_id: str) -> dict:
    return await _dispatch("run_add_to_ouput.py", scenario_id)


@app.delete(f"{API_PREFIX}/scenarios/{{scenario_id}}")
async def delete_scenario(
    scenario_id: str,
    report_type: str = "output_data",
    image: str | None = None,
) -> dict:
    report: dict = {"id": scenario_id, "type": report_type}
    if image:
        report["image"] = image
    return await _dispatch("run_remove_report.py", {"report": report})


@app.get(f"{API_PREFIX}/macro/cred-output")
async def macro_cred_output() -> dict:
    return await _dispatch("run_fetch_cred_output.py", None)


@app.post(f"{API_PREFIX}/macro/chart-data")
async def macro_chart_data(payload: dict) -> dict:
    return await _dispatch("run_fetch_macro_chart_data.py", payload)


@app.get(f"{API_PREFIX}/countries")
async def countries() -> dict:
    import pycountry

    data = [{"code": c.alpha_3, "name": c.name} for c in pycountry.countries]
    return {"data": data, "status": {"code": 2000, "message": "ok"}}


@app.post(f"{API_PREFIX}/temp/clear")
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
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))

    config = uvicorn.Config(app, log_level="warning")
    server = _ReadyNotifyServer(config)
    server.run(sockets=[sock])


if __name__ == "__main__":
    run()
