"""
Tests for the FastAPI PoC server.

Run with:  pytest test_server.py  (from docs/spikes/fastapi-poc/)
"""

import json
import sys
import os

import pytest

# Allow `from server import app` when pytest runs from the repo root
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient  # noqa: E402
from server import app  # noqa: E402

client = TestClient(app)


class TestHealth:
    def test_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_body_is_status_ok(self):
        response = client.get("/health")
        assert response.json() == {"status": "ok"}

    def test_content_type_is_json(self):
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]


class TestStreamTest:
    def test_returns_200(self):
        with client.stream("GET", "/stream/test") as response:
            assert response.status_code == 200

    def test_content_type_is_event_stream(self):
        with client.stream("GET", "/stream/test") as response:
            assert "text/event-stream" in response.headers["content-type"]

    def test_emits_exactly_five_events(self):
        with client.stream("GET", "/stream/test") as response:
            events = _collect_sse_events(response)
        assert len(events) == 5

    def test_events_have_correct_structure(self):
        with client.stream("GET", "/stream/test") as response:
            events = _collect_sse_events(response)
        for i, event in enumerate(events, start=1):
            assert event["type"] == "progress"
            assert event["step"] == i
            assert event["total"] == 5


# ── helpers ───────────────────────────────────────────────────────────────────


def _collect_sse_events(response) -> list[dict]:
    """Parse `data: <json>` lines from an SSE response into a list of dicts."""
    return [
        json.loads(line[5:].strip())
        for line in response.iter_lines()
        if line.startswith("data:")
    ]
