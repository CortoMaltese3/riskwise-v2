"""Engine adapter package — single import boundary for `climate-lama-engine`.

Per [DECISIONS.md D26](../../docs/DECISIONS.md), this is the only package in
the backend allowed to import from `climate_lama_engine.*`. The CI lint rule
in `scripts/check_engine_imports.py` enforces this; see `CONTRIBUTING.md` for
the rationale.

## Backend selection

The `RISKWISE_ENGINE_BACKEND` environment variable selects the compute
backend per-handler. Phase 6 Track 3 wires up the consumers:

- `"climada"` (default for the duration of Phase 6 Tracks 1–4) — existing
  CLIMADA path; the adapter functions in this module are not invoked.
- `"engine"` — climate-lama-engine path via this adapter.

Track 5 (#164) flips the default to `"engine"`. Track 6 (#166) removes the
CLIMADA path and the env var becomes a no-op.

## Public API

The names re-exported below are the only stable surface of this package.
Anything else under `backend.engine.*` is internal and may change without
notice.
"""

from backend.engine.adapter import (
    EngineUnavailableError,
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
    MeasureSpec,
    build_exposures,
    build_hazard,
    build_impfset,
    build_measure,
    run_cost_benefit,
    run_impact,
)

__all__ = [
    "EngineUnavailableError",
    "ExposureArrays",
    "HazardArrays",
    "ImpactFunctionSpec",
    "MeasureSpec",
    "build_exposures",
    "build_hazard",
    "build_impfset",
    "build_measure",
    "run_cost_benefit",
    "run_impact",
]
