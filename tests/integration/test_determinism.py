"""Seed-propagation determinism test for the scenario API (issue #114).

The CLIMADA pipeline is too heavy for CI (see
``tests/determinism/test_scenario_bit_identical.py`` for the same
constraint). Instead, this test pins the *plumbing* guarantee: if the same
EGY flood scenario is posted twice with the same ``random_seed``, both
runs see the same seed in the payload and produce bit-identical AAL
values. The stubbed runner derives its AAL from the seed via
``np.random.default_rng`` (the only allowed entry point under ruff's
``NPY002``) so a downstream regression that drops or mutates
``random_seed`` during dispatch would break the equality assertion.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

import app as app_module
import numpy as np
from fastapi.testclient import TestClient


def _deterministic_aal_runner(payload: dict[str, Any]) -> dict[str, Any]:
    """Stand-in runner whose AAL is a pure function of ``random_seed``.

    Real CLIMADA stochastic loops derive a ``Generator`` from the stored
    seed; this stub does the same with a scalar output so tests can
    compare across runs without the geospatial stack.
    """
    seed = int(payload.get("random_seed", 0))
    rng = np.random.default_rng(seed)
    aal = float(rng.standard_normal(1024).mean())
    return {
        "data": {"aal": aal, "seed_seen": seed},
        "status": {"code": 2000, "message": "ok"},
    }


def _run_once(client: TestClient, payload: dict[str, Any]) -> dict[str, Any]:
    accepted = client.post("/api/v1/scenario/run", json=payload)
    assert accepted.status_code == 200, accepted.text
    job_id = accepted.json()["job_id"]

    with client.stream("GET", f"/api/v1/scenario/{job_id}/stream") as stream:
        assert stream.status_code == 200
        for line in stream.iter_lines():
            if line.startswith("data:"):
                event = json.loads(line[5:].strip())
                if event.get("type") == "result":
                    return event["data"]
    raise AssertionError("SSE stream closed without a result event")


def test_same_seed_produces_bit_identical_aal(api_client: TestClient) -> None:
    payload = {
        "countryName": "egypt",
        "hazardType": "flood",
        "scenario": "rcp85",
        "random_seed": 4_242_424_242,
    }

    with patch.object(app_module, "_run_scenario_sync", side_effect=_deterministic_aal_runner):
        first = _run_once(api_client, payload)
        second = _run_once(api_client, payload)

    assert first["data"]["seed_seen"] == payload["random_seed"]
    assert second["data"]["seed_seen"] == payload["random_seed"]
    # The equality must be byte-exact; any float drift here would mean the
    # plumbing rounded, re-serialised, or lost precision somewhere along
    # the JSON → Pydantic → SSE path.
    assert first["data"]["aal"] == second["data"]["aal"]
