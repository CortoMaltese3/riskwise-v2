"""Tests for the FastAPI backend (issues #11 and #12).

All legacy handlers are mocked at ``app._dispatch_sync`` / ``app._run_scenario_sync``
so the test suite does not require CLIMADA or any of the heavy backend
dependencies. This matches Phase 1 testing pragma: endpoints are verified
by shape and dispatch, not by re-running CLIMADA end-to-end.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from unittest.mock import AsyncMock, patch

import app as app_module
import pytest
import uvicorn
from app import app
from cancellation import CancelRequested, cancel_event_var
from fastapi.testclient import TestClient
from progress import progress_callback_var


@pytest.fixture(autouse=True)
def _reset_active_job() -> None:
    """Every test starts with no in-flight scenario recorded."""
    app_module._active_job_id = None
    yield
    app_module._active_job_id = None


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False lets the registered exception handler
    # translate unhandled errors into structured 500 responses instead of
    # having TestClient re-raise them (which would skip the handler and
    # defeat the whole point of the envelope tests).
    return TestClient(app, raise_server_exceptions=False)


def _collect_sse(response) -> list[dict]:
    return [
        json.loads(line[5:].strip()) for line in response.iter_lines() if line.startswith("data:")
    ]


class TestHealth:
    def test_health_returns_ok(self, client: TestClient) -> None:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestSynchronousEndpoints:
    def test_data_validate_dispatches_to_check_data_type(self, client: TestClient) -> None:
        envelope = {"data": {"data": {}}, "status": {"code": 2000, "message": "ok"}}
        with patch.object(app_module, "_dispatch_sync", return_value=envelope) as m:
            response = client.post(
                "/api/v1/data/validate",
                json={"country": "Egypt", "dataType": "exposures"},
            )
        assert response.status_code == 200
        assert response.json() == envelope
        m.assert_called_once()
        args, _ = m.call_args
        assert args[0] == "run_check_data_type.py"
        assert args[1] == {"country": "Egypt", "dataType": "exposures"}

    def test_data_validate_rejects_missing_fields(self, client: TestClient) -> None:
        response = client.post("/api/v1/data/validate", json={"country": "Egypt"})
        assert response.status_code == 422

    def test_measures_passes_path_params(self, client: TestClient) -> None:
        envelope = {
            "data": {"adaptationMeasures": []},
            "status": {"code": 2000, "message": "ok"},
        }
        with patch.object(app_module, "_dispatch_sync", return_value=envelope) as m:
            response = client.get("/api/v1/measures/Egypt/Flood")
        assert response.status_code == 200
        assert response.json() == envelope
        m.assert_called_once_with(
            "run_fetch_measures.py",
            {"countryName": "Egypt", "hazardType": "Flood"},
        )

    def test_list_scenarios(self, client: TestClient) -> None:
        expected = {"data": [], "status": {"code": 2000, "message": "ok"}}
        with patch.object(app_module, "_dispatch_sync", return_value=expected):
            response = client.get("/api/v1/scenarios")
        assert response.status_code == 200
        assert response.json() == expected

    def test_get_scenario_found(self, client: TestClient) -> None:
        reports = [
            {"id": "1", "scenario_id": "abc", "title": "First"},
            {"id": "2", "scenario_id": "xyz", "title": "Second"},
        ]
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": reports, "status": {"code": 2000, "message": "ok"}},
        ):
            response = client.get("/api/v1/scenarios/xyz")
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["scenario_id"] == "xyz"
        assert body["status"]["code"] == 2000

    def test_get_scenario_not_found(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": [], "status": {"code": 2000}},
        ):
            response = client.get("/api/v1/scenarios/missing")
        assert response.status_code == 404

    def test_export_scenario_injects_scenario_run_code(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": {"report_path": "/tmp/r.xlsx"}, "status": {"code": 2000}},
        ) as m:
            response = client.post(
                "/api/v1/scenarios/abc/export",
                json={"exportType": "excel", "report": {"type": "output_data", "id": "1"}},
            )
        assert response.status_code == 200
        args, _ = m.call_args
        assert args[0] == "run_export_report.py"
        assert args[1]["scenarioRunCode"] == "abc"
        assert args[1]["exportType"] == "excel"

    def test_save_scenario(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": {"data": {}}, "status": {"code": 2000, "message": "ok"}},
        ) as m:
            response = client.post("/api/v1/scenarios/abc/save")
        assert response.status_code == 200
        m.assert_called_once_with("run_add_to_ouput.py", "abc")

    def test_delete_scenario_output_data(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": {}, "status": {"code": 2000}},
        ) as m:
            response = client.delete("/api/v1/scenarios/abc", params={"report_type": "output_data"})
        assert response.status_code == 200
        args, _ = m.call_args
        assert args[0] == "run_remove_report.py"
        assert args[1] == {"report": {"id": "abc", "type": "output_data"}}

    def test_delete_scenario_image(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": {}, "status": {"code": 2000}},
        ) as m:
            response = client.delete(
                "/api/v1/scenarios/abc",
                params={"report_type": "exposure_map_data", "image": "/path/to/img.png"},
            )
        assert response.status_code == 200
        args, _ = m.call_args
        assert args[1]["report"]["image"] == "/path/to/img.png"
        assert args[1]["report"]["type"] == "exposure_map_data"

    def test_macro_cred_output(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": [], "status": {"code": 2000}},
        ) as m:
            response = client.get("/api/v1/macro/cred-output")
        assert response.status_code == 200
        m.assert_called_once_with("run_fetch_cred_output.py", None)

    def test_macro_chart_data(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": {"years": []}, "status": {"code": 2000}},
        ) as m:
            response = client.post(
                "/api/v1/macro/chart-data",
                json={
                    "countryName": "Egypt",
                    "scenario": "rcp85",
                    "sector": "a",
                    "variable": "gdp",
                },
            )
        assert response.status_code == 200
        args, _ = m.call_args
        assert args[0] == "run_fetch_macro_chart_data.py"
        assert args[1]["countryName"] == "Egypt"

    def test_countries_returns_iso3_list(self, client: TestClient) -> None:
        response = client.get("/api/v1/countries")
        assert response.status_code == 200
        body = response.json()
        assert body["status"]["code"] == 2000
        assert isinstance(body["data"], list)
        assert body["data"]
        assert all("code" in c and "name" in c for c in body["data"])

    def test_temp_clear(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"success": True, "message": "cleared"},
        ) as m:
            response = client.post("/api/v1/temp/clear")
        assert response.status_code == 200
        m.assert_called_once_with("run_clear_temp_dir.py", None)


class TestScenarioFlow:
    def test_scenario_run_returns_job_id(self, client: TestClient) -> None:
        def fake_scenario(_payload: dict) -> dict:
            return {"data": {"mapTitle": "T"}, "status": {"code": 2000}}

        with patch.object(app_module, "_run_scenario_sync", side_effect=fake_scenario):
            response = client.post("/api/v1/scenario/run", json={"countryName": "Egypt"})
            assert response.status_code == 200
            job_id = response.json().get("job_id")
            assert isinstance(job_id, str) and job_id
            # Drain the stream so the job cleans itself up.
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                _collect_sse(stream)

    def test_scenario_stream_emits_progress_and_result(self, client: TestClient) -> None:
        def fake_scenario(_payload: dict) -> dict:
            cb = progress_callback_var.get()
            assert cb is not None, "progress callback must propagate into the worker thread"
            cb({"type": "progress", "progress": 50, "message": "halfway"})
            cb({"type": "progress", "progress": 100, "message": "done"})
            return {"data": {"mapTitle": "T"}, "status": {"code": 2000}}

        with patch.object(app_module, "_run_scenario_sync", side_effect=fake_scenario):
            job_id = client.post("/api/v1/scenario/run", json={}).json()["job_id"]
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                assert stream.status_code == 200
                assert "text/event-stream" in stream.headers["content-type"]
                events = _collect_sse(stream)

        progress_events = [e for e in events if e["type"] == "progress"]
        result_events = [e for e in events if e["type"] == "result"]
        assert len(progress_events) == 2
        assert progress_events[0]["progress"] == 50
        assert progress_events[1]["progress"] == 100
        assert len(result_events) == 1
        assert result_events[0]["data"]["data"]["mapTitle"] == "T"

    def test_scenario_stream_emits_error(self, client: TestClient) -> None:
        def failing_scenario(_payload: dict) -> dict:
            raise ValueError("boom")

        with patch.object(app_module, "_run_scenario_sync", side_effect=failing_scenario):
            job_id = client.post("/api/v1/scenario/run", json={}).json()["job_id"]
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                events = _collect_sse(stream)

        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        event = error_events[0]
        assert event["status"] == "error"
        assert event["code"] == "scenario_error"
        assert event["message"] == "Scenario run failed"
        assert "boom" in event["detail"]
        assert event["error_id"]

    def test_scenario_stream_unknown_job_id_returns_404(self, client: TestClient) -> None:
        response = client.get("/api/v1/scenario/does-not-exist/stream")
        assert response.status_code == 404
        body = response.json()
        assert body["status"] == "error"
        assert body["code"] == "not_found"
        assert body["error_id"]

    def test_job_registry_cleaned_up_after_stream(self, client: TestClient) -> None:
        def fake_scenario(_payload: dict) -> dict:
            return {"data": {"mapTitle": "T"}, "status": {"code": 2000}}

        with patch.object(app_module, "_run_scenario_sync", side_effect=fake_scenario):
            job_id = client.post("/api/v1/scenario/run", json={}).json()["job_id"]
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                _collect_sse(stream)

        assert app_module.jobs.get_queue(job_id) is None


class TestReadyNotifyServer:
    def test_ready_notify_server_is_uvicorn_server_subclass(self) -> None:
        assert issubclass(app_module._ReadyNotifyServer, uvicorn.Server)

    def test_startup_prints_ready_event_with_port(self, capsys) -> None:
        class _FakeSocket:
            def getsockname(self) -> tuple[str, int]:
                return ("127.0.0.1", 54321)

        class _FakeServer:
            sockets = [_FakeSocket()]

        config = uvicorn.Config(app_module.app)
        server = app_module._ReadyNotifyServer(config)
        server.should_exit = False
        server.servers = [_FakeServer()]

        with patch.object(uvicorn.Server, "startup", new=AsyncMock(return_value=None)):
            asyncio.run(server.startup())

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())
        assert event == {"type": "event", "name": "ready", "port": 54321}

    def test_startup_no_op_when_should_exit(self, capsys) -> None:
        config = uvicorn.Config(app_module.app)
        server = app_module._ReadyNotifyServer(config)
        server.should_exit = True

        with patch.object(uvicorn.Server, "startup", new=AsyncMock(return_value=None)):
            asyncio.run(server.startup())

        assert capsys.readouterr().out == ""


class TestRun:
    def test_run_binds_loopback_and_serves(self) -> None:
        with (
            patch.object(app_module, "_ReadyNotifyServer") as MockServer,
            patch("socket.socket") as MockSocket,
            patch("uvicorn.Config") as MockConfig,
        ):
            app_module.run()

        sock_instance = MockSocket.return_value
        sock_instance.bind.assert_called_once_with(("127.0.0.1", 0))
        MockConfig.assert_called_once()
        MockServer.return_value.run.assert_called_once_with(sockets=[sock_instance])


class TestDispatchUnknown:
    def test_unknown_script_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown script"):
            app_module._dispatch_sync("run_does_not_exist.py", None)


class TestStructuredErrorEnvelope:
    def test_http_exception_serialized_as_error_envelope(self, client: TestClient) -> None:
        # Stub the legacy handler so we exercise the explicit 404 branch in
        # ``get_scenario`` (no CLIMADA in tests).
        with patch.object(
            app_module, "_dispatch_sync", return_value={"data": [], "status": {"code": 2000}}
        ):
            response = client.get("/api/v1/scenarios/missing-scenario-id")
        assert response.status_code == 404
        body = response.json()
        assert body["status"] == "error"
        assert body["code"] == "not_found"
        assert body["message"]
        assert body["error_id"]

    def test_validation_error_returns_structured_envelope(self, client: TestClient) -> None:
        response = client.post("/api/v1/data/validate", json={"country": "Egypt"})
        assert response.status_code == 422
        body = response.json()
        assert body["status"] == "error"
        assert body["code"] == "validation_error"
        assert body["error_id"]

    def test_unhandled_exception_is_caught_and_structured(self, client: TestClient) -> None:
        # Scenario 5: job isolation. An unhandled error in one handler must
        # produce a structured 500 without tearing down FastAPI itself.
        with patch.object(app_module, "_dispatch_sync", side_effect=RuntimeError("boom")):
            response = client.get("/api/v1/macro/cred-output")
        assert response.status_code == 500
        body = response.json()
        assert body["status"] == "error"
        assert body["code"] == "internal_error"
        assert "boom" in body["detail"]
        assert body["error_id"]

        # FastAPI is still alive and serving other endpoints.
        healthy = client.get("/api/v1/health")
        assert healthy.status_code == 200


class TestSingleJobInvariant:
    def test_second_run_while_active_returns_409(self, client: TestClient) -> None:
        # ``TestClient.post`` blocks until the event loop is idle, which hides
        # a concurrent second POST. We use httpx.AsyncClient against the ASGI
        # transport so we can fire the second request while the first is
        # still running its worker thread.
        from httpx import ASGITransport, AsyncClient

        async def _drain_stream(ac: AsyncClient, job_id: str) -> None:
            async with ac.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                async for _ in stream.aiter_lines():
                    pass

        async def run() -> None:
            ready = threading.Event()
            release = threading.Event()

            def slow_scenario(_payload: dict) -> dict:
                ready.set()
                release.wait(timeout=5)
                return {"data": {"mapTitle": "T"}, "status": {"code": 2000}}

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                with patch.object(app_module, "_run_scenario_sync", side_effect=slow_scenario):
                    first_task = asyncio.create_task(ac.post("/api/v1/scenario/run", json={}))
                    await asyncio.to_thread(ready.wait, 5)
                    assert app_module._active_job_id is not None

                    second = await ac.post("/api/v1/scenario/run", json={})
                    assert second.status_code == 409
                    body = second.json()
                    assert body["status"] == "error"
                    assert body["code"] == "job_conflict"
                    assert body["error_id"]

                    release.set()
                    first = await first_task
                    assert first.status_code == 200

                    # Drain the SSE stream so ``_execute_scenario`` finishes
                    # its finally block and clears ``_active_job_id`` before
                    # the follow-up POST below.
                    await _drain_stream(ac, first.json()["job_id"])

                # After the first job drains, a new run must be accepted again.
                with patch.object(
                    app_module,
                    "_run_scenario_sync",
                    return_value={"data": {"mapTitle": "T"}, "status": {"code": 2000}},
                ):
                    third = await ac.post("/api/v1/scenario/run", json={})
                    assert third.status_code == 200
                    await _drain_stream(ac, third.json()["job_id"])

        asyncio.run(run())


class TestMemoryPreflight:
    def test_insufficient_memory_rejects_with_413(self, client: TestClient) -> None:
        with patch.object(
            app_module,
            "_check_memory_preflight",
            return_value=(False, "Insufficient memory: 500 MB available, 2048 MB required"),
        ):
            response = client.post("/api/v1/scenario/run", json={})
        assert response.status_code == 413
        body = response.json()
        assert body["status"] == "error"
        assert body["code"] == "memory_insufficient"
        assert "Insufficient memory" in body["message"]
        assert body["error_id"]

    def test_preflight_helper_skips_gracefully_without_psutil(self) -> None:
        # Import is resolved at call time; simulate it being absent.
        with patch.dict("sys.modules", {"psutil": None}):
            ok, msg = app_module._check_memory_preflight()
        assert ok is True
        assert msg == ""

    def test_preflight_helper_rejects_when_available_below_threshold(self) -> None:
        class _VM:
            available = 100 * 1024 * 1024  # 100 MB
            total = 8 * 1024 * 1024 * 1024

        fake_psutil = type("psutil", (), {"virtual_memory": staticmethod(lambda: _VM())})
        with patch.dict("sys.modules", {"psutil": fake_psutil}):
            ok, msg = app_module._check_memory_preflight()
        assert ok is False
        assert "Insufficient memory" in msg


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
                from cancellation import check_cancelled

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
            from cancellation import check_cancelled

            with pytest.raises(CancelRequested):
                check_cancelled()
        finally:
            cancel_event_var.reset(token)

    def test_check_cancelled_no_op_when_flag_unset(self) -> None:
        event = threading.Event()
        token = cancel_event_var.set(event)
        try:
            from cancellation import check_cancelled

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
