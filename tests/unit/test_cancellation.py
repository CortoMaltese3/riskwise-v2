"""Tests for cooperative cancellation and client-disconnect cancellation.

Extracted from ``backend/test_app.py`` (issue #509). The classes below
exercise the cancellation plumbing in [backend/cancellation.py](backend/cancellation.py)
and its FastAPI wiring; they used to share the router-level fixtures
defined in ``backend/test_app.py`` but are self-contained now.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import backend.app as app_module
from backend.app import app
from backend.cancellation import CancelRequested, cancel_event_var


@pytest.fixture(autouse=True)
def _reset_active_job() -> None:
    """Every test starts with no in-flight scenario recorded."""
    app_module._active_job_id = None
    yield
    app_module._active_job_id = None


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


class TestCooperativeCancellation:
    def test_cancel_endpoint_sets_flag_and_aborts_run(self) -> None:
        # The sync TestClient serializes requests through the event loop, so
        # POST /cancel cannot run while POST /run's worker thread is still
        # blocked. Use httpx.AsyncClient against the ASGI transport so the
        # cancel request actually reaches the handler mid-run.
        from httpx import ASGITransport, AsyncClient

        async def run() -> None:
            worker_started = threading.Event()
            release = threading.Event()

            def scenario_with_checkpoint(_payload: dict) -> dict:
                worker_started.set()
                release.wait(timeout=5)
                from backend.cancellation import check_cancelled

                check_cancelled()
                return {"data": {"mapTitle": "done"}, "status": {"code": 2000}}

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                with patch.object(
                    app_module, "_run_scenario_sync", side_effect=scenario_with_checkpoint
                ):
                    run_task = asyncio.create_task(ac.post("/api/v1/scenario/run", json={}))
                    await asyncio.to_thread(worker_started.wait, 5)
                    assert app_module._active_job_id is not None
                    job_id = app_module._active_job_id

                    cancel_response = await ac.post(f"/api/v1/scenario/{job_id}/cancel")
                    assert cancel_response.status_code == 200
                    assert cancel_response.json()["cancelled"] is True

                    release.set()
                    await run_task

                    events: list[dict] = []
                    async with ac.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                        async for line in stream.aiter_lines():
                            if line.startswith("data:"):
                                events.append(json.loads(line[5:].strip()))

            cancelled = [e for e in events if e["type"] == "cancelled"]
            errors = [e for e in events if e["type"] == "error"]
            assert cancelled, f"expected a cancelled event, got {events}"
            assert errors == []
            assert cancelled[0]["code"] == "cancelled"
            assert cancelled[0]["error_id"]

        asyncio.run(run())

    def test_cancel_unknown_job_id_returns_404(self, client: TestClient) -> None:
        response = client.post("/api/v1/scenario/no-such-job/cancel")
        assert response.status_code == 404
        body = response.json()
        assert body["code"] == "not_found"

    def test_check_cancelled_raises_when_flag_set(self) -> None:
        event = threading.Event()
        token = cancel_event_var.set(event)
        try:
            event.set()
            from backend.cancellation import check_cancelled

            with pytest.raises(CancelRequested):
                check_cancelled()
        finally:
            cancel_event_var.reset(token)

    def test_check_cancelled_no_op_when_flag_unset(self) -> None:
        event = threading.Event()
        token = cancel_event_var.set(event)
        try:
            from backend.cancellation import check_cancelled

            check_cancelled()  # must not raise
        finally:
            cancel_event_var.reset(token)


class TestClientDisconnectCancellation:
    def test_stream_cleanup_sets_cancel_flag(self, client: TestClient) -> None:
        worker_started = threading.Event()
        worker_released = threading.Event()

        def slow_scenario(_payload: dict) -> dict:
            worker_started.set()
            # Wait for the test to close the stream before finishing so the
            # cancel_event gets captured post-disconnect.
            worker_released.wait(timeout=5)
            return {"data": {"mapTitle": "late"}, "status": {"code": 2000}}

        with patch.object(app_module, "_run_scenario_sync", side_effect=slow_scenario):
            job_id = client.post("/api/v1/scenario/run", json={}).json()["job_id"]
            assert worker_started.wait(timeout=5)

            cancel_event = app_module.jobs.get_cancel_event(job_id)
            assert cancel_event is not None and not cancel_event.is_set()

            # Open the stream then abort it immediately. The generator's
            # ``finally`` block must set the cancel flag.
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream"):
                pass

            # After the stream closes, the flag is set even though the
            # worker is still running.
            assert cancel_event.is_set()

            # Let the worker finish so the test exits cleanly.
            worker_released.set()
            # Give the event loop time to drain and reset _active_job_id.
            for _ in range(50):
                if app_module._active_job_id is None:
                    break
                time.sleep(0.05)
