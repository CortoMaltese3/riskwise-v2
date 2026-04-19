"""Tests for the structlog JSON configuration and request-ID middleware."""

from __future__ import annotations

import io
import json
from pathlib import Path

import app as app_module
import pytest
from app import REQUEST_ID_HEADER, app
from fastapi.testclient import TestClient
from logging_config import (
    bind_request_id,
    configure_logging,
    get_logger,
    request_id_var,
    reset_request_id,
)


@pytest.fixture
def captured_stream() -> io.StringIO:
    """Route every structlog line produced during a test into a StringIO."""
    stream = io.StringIO()
    configure_logging(stream=stream)
    return stream


class TestStructlogOutput:
    def test_log_line_is_json_with_core_fields(self, captured_stream: io.StringIO) -> None:
        get_logger("unit").info("hello", extra="value")
        line = captured_stream.getvalue().strip()
        record = json.loads(line)
        assert record["event"] == "hello"
        assert record["level"] == "info"
        assert record["logger"] == "unit"
        assert record["extra"] == "value"
        assert "timestamp" in record

    def test_unbound_request_id_falls_back_to_dash(self, captured_stream: io.StringIO) -> None:
        get_logger().info("no-bind")
        record = json.loads(captured_stream.getvalue().strip())
        assert record["request_id"] == "-"

    def test_bound_request_id_propagates_to_each_line(self, captured_stream: io.StringIO) -> None:
        token = bind_request_id("abc-123")
        try:
            get_logger("t").info("first")
            get_logger("t").warning("second")
        finally:
            reset_request_id(token)
        lines = [json.loads(line) for line in captured_stream.getvalue().splitlines() if line]
        assert [rec["request_id"] for rec in lines] == ["abc-123", "abc-123"]
        # Post-reset, the contextvar is back to the sentinel.
        assert request_id_var.get() == "-"

    def test_writes_to_backend_log_when_dir_provided(self, tmp_path: Path) -> None:
        configure_logging(log_dir=tmp_path)
        get_logger("file").info("persisted")
        log_file = tmp_path / "backend.log"
        assert log_file.exists()
        content = log_file.read_text(encoding="utf-8").strip().splitlines()
        assert content
        assert json.loads(content[-1])["event"] == "persisted"


class TestRequestIdMiddleware:
    def _client(self, stream: io.StringIO) -> TestClient:
        configure_logging(stream=stream)
        return TestClient(app, raise_server_exceptions=False)

    def test_header_is_echoed_on_response(self) -> None:
        stream = io.StringIO()
        client = self._client(stream)
        response = client.get("/api/v1/health", headers={REQUEST_ID_HEADER: "fixed-uuid-1234"})
        assert response.status_code == 200
        assert response.headers[REQUEST_ID_HEADER] == "fixed-uuid-1234"

    def test_missing_header_gets_a_generated_uuid(self) -> None:
        stream = io.StringIO()
        client = self._client(stream)
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        # Generated IDs are non-empty and unique per request.
        assert response.headers[REQUEST_ID_HEADER]
        assert len(response.headers[REQUEST_ID_HEADER]) >= 32

    def test_logs_carry_the_request_id_from_the_header(self) -> None:
        stream = io.StringIO()
        client = self._client(stream)
        client.get("/api/v1/health", headers={REQUEST_ID_HEADER: "trace-xyz"})
        records = [json.loads(line) for line in stream.getvalue().splitlines() if line]
        # At least the request.start and request.end lines should carry it.
        matching = [r for r in records if r.get("request_id") == "trace-xyz"]
        events = {r["event"] for r in matching}
        assert {"request.start", "request.end"}.issubset(events)

    def test_error_envelope_includes_request_id(self) -> None:
        stream = io.StringIO()
        client = self._client(stream)
        response = client.get(
            "/api/v1/scenario/no-such-job/stream",
            headers={REQUEST_ID_HEADER: "err-trace"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["request_id"] == "err-trace"
        assert body["error_id"]

    def test_request_id_appears_in_scenario_error_event(self) -> None:
        """Scenario 1 end-to-end: error stream event carries the header's UUID."""
        from unittest.mock import patch

        stream = io.StringIO()
        client = self._client(stream)

        def blowup(_payload: dict) -> dict:
            raise ValueError("boom")

        with patch.object(app_module, "_run_scenario_sync", side_effect=blowup):
            run = client.post(
                "/api/v1/scenario/run",
                json={},
                headers={REQUEST_ID_HEADER: "scenario-trace"},
            )
            job_id = run.json()["job_id"]
            with client.stream(
                "GET",
                f"/api/v1/scenario/{job_id}/stream",
                headers={REQUEST_ID_HEADER: "scenario-trace"},
            ) as response:
                events = [
                    json.loads(line[5:].strip())
                    for line in response.iter_lines()
                    if line.startswith("data:")
                ]
        error_events = [e for e in events if e["type"] == "error"]
        assert error_events and error_events[0]["request_id"] == "scenario-trace"
