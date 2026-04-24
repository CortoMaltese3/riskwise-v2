"""Health endpoint smoke test (issue #114 acceptance criterion).

The ``/api/v1/health`` endpoint is the liveness probe the Electron main
process polls after spawning the backend: the response body must stay
exactly ``{"status": "ok"}`` because both the renderer handshake and any
future container orchestration gate on that shape.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_ok(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
