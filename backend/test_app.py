"""Tests for the FastAPI backend (issue #11).

All legacy handlers are mocked at ``app._dispatch_sync`` / ``app._run_scenario_sync``
so the test suite does not require CLIMADA or any of the heavy backend
dependencies. This matches Phase 1 testing pragma: endpoints are verified
by shape and dispatch, not by re-running CLIMADA end-to-end.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import app as app_module
import pytest
import uvicorn
from app import app
from fastapi.testclient import TestClient
from progress import progress_callback_var


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


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
        with patch.object(app_module, "_dispatch_sync", return_value={"ok": 1}) as m:
            response = client.post(
                "/api/v1/data/validate",
                json={"country": "Egypt", "dataType": "exposures"},
            )
        assert response.status_code == 200
        assert response.json() == {"ok": 1}
        m.assert_called_once()
        args, _ = m.call_args
        assert args[0] == "run_check_data_type.py"
        assert args[1] == {"country": "Egypt", "dataType": "exposures"}

    def test_measures_passes_path_params(self, client: TestClient) -> None:
        expected = {"data": {"adaptationMeasures": []}, "status": {"code": 2000}}
        with patch.object(app_module, "_dispatch_sync", return_value=expected) as m:
            response = client.get("/api/v1/measures/Egypt/Flood")
        assert response.status_code == 200
        assert response.json() == expected
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
            {"scenario_id": "abc", "title": "First"},
            {"scenario_id": "xyz", "title": "Second"},
        ]
        with patch.object(
            app_module,
            "_dispatch_sync",
            return_value={"data": reports, "status": {"code": 2000}},
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
            return_value={"data": {}, "status": {"code": 2000}},
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
        assert "boom" in error_events[0]["error"]

    def test_scenario_stream_unknown_job_id_returns_404(self, client: TestClient) -> None:
        response = client.get("/api/v1/scenario/does-not-exist/stream")
        assert response.status_code == 404

    def test_job_registry_cleaned_up_after_stream(self, client: TestClient) -> None:
        def fake_scenario(_payload: dict) -> dict:
            return {"data": {"mapTitle": "T"}, "status": {"code": 2000}}

        with patch.object(app_module, "_run_scenario_sync", side_effect=fake_scenario):
            job_id = client.post("/api/v1/scenario/run", json={}).json()["job_id"]
            with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
                _collect_sse(stream)

        assert app_module.jobs.get(job_id) is None


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
