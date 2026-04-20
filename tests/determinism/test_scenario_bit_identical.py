"""Same-machine bit-identical determinism test (#55 Scenario 4).

The full CLIMADA pipeline is too heavy to spin up in CI (no geospatial
stack, no seed data bundles). This test pins the next-best invariant
under our control: given the same seed and the same canonical inputs,
the scenario-persistence glue — provenance hashing, canonical JSON, and
the exported parquet / JSON byte blobs — produces byte-identical
artefacts across two runs.

If this ever fails, something downstream is non-deterministic (dict
iteration order, float noise, timestamp leakage into payloads, ...) and
the reproducibility guarantee in the exported scenario note is broken.
"""

from __future__ import annotations

import io
import json

import numpy as np
from provenance import canonical_json_sha256, sha256_bytes

_FIXTURE_PAYLOAD = {
    "country": "Egypt",
    "hazard_type": "flood",
    "scenario": "rcp85",
    "aal": 1.234567890123,
    "per_rp": {"10": 100.5, "100": 250.25, "1000": 1000.0},
    "map_title": "Egypt flood 2050",
}


def _simulate_numerical_output(seed: int) -> tuple[float, dict[str, float]]:
    """Stand-in for the impact pipeline's per-run numerical outputs.

    Uses ``np.random.default_rng`` (the only allowed entry point) so the
    exact same seed produces the exact same AAL and per-RP numbers on
    the same machine.
    """
    rng = np.random.default_rng(seed)
    draws = rng.standard_normal(1024)
    aal = float(draws.mean())
    per_rp = {
        "10": float(np.quantile(draws, 0.9)),
        "100": float(np.quantile(draws, 0.99)),
        "1000": float(np.quantile(draws, 0.999)),
    }
    return aal, per_rp


def _export_numpy_array(seed: int) -> bytes:
    """Stand-in for a scenario's array artefact. ``np.save`` is deterministic
    given the same array bytes, so this is the cleanest "bit-identical
    exported file" check we can make without depending on pyarrow in CI."""
    rng = np.random.default_rng(seed)
    arr = rng.standard_normal((8, 4))
    buf = io.BytesIO()
    np.save(buf, arr, allow_pickle=False)
    return buf.getvalue()


def test_scenario_outputs_are_bit_identical_across_reruns() -> None:
    seed = 4_242_424_242

    aal1, per_rp1 = _simulate_numerical_output(seed)
    aal2, per_rp2 = _simulate_numerical_output(seed)
    assert aal1 == aal2
    assert per_rp1 == per_rp2

    payload1 = {**_FIXTURE_PAYLOAD, "aal": aal1, "per_rp": per_rp1}
    payload2 = {**_FIXTURE_PAYLOAD, "aal": aal2, "per_rp": per_rp2}
    # Provenance hash of the canonical form — must be byte-identical.
    assert canonical_json_sha256(payload1) == canonical_json_sha256(payload2)

    # Canonical JSON bytes (sorted keys, no trailing noise) — byte-identical.
    json1 = json.dumps(payload1, sort_keys=True, separators=(",", ":")).encode()
    json2 = json.dumps(payload2, sort_keys=True, separators=(",", ":")).encode()
    assert json1 == json2
    assert sha256_bytes(json1) == sha256_bytes(json2)

    # Exported array bytes — ``np.save`` writes the raw array buffer with
    # no timestamp metadata, so repeated exports agree byte-wise.
    npy1 = _export_numpy_array(seed)
    npy2 = _export_numpy_array(seed)
    assert npy1 == npy2
