"""Engine adapter package — single import boundary for `climate-lama-engine`.

Per [DECISIONS.md D26](../../docs/DECISIONS.md), this is the only package in
the backend allowed to import from `climate_lama_engine.*`. The CI lint rule
in `scripts/check_engine_imports.py` enforces this; see `CONTRIBUTING.md` for
the rationale.

## Backend selection

The `RISKWISE_ENGINE_BACKEND` environment variable selects the compute
backend per-handler. Phase 6 Track 3 wires up the consumers:

- `"engine"` (default after Track 5 / #164) — climate-lama-engine path via
  this adapter.
- `"climada"` — legacy CLIMADA path; kept as a diagnostic escape hatch
  until Track 6 (#166) removes it and the env var becomes a no-op.

## Public API

The names re-exported below are the only stable surface of this package.
Anything else under `backend.engine.*` is internal and may change without
notice.
"""

from backend.engine.adapter import (
    EngineUnavailableError,
    assign_centroids,
    build_exposures,
    build_hazard,
    build_impfset,
    build_measure,
    intensity_to_dense,
    local_exceedance_imp,
    run_cost_benefit,
    run_impact,
)
from backend.engine.types import (
    EntityBundle,
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
    MeasureSpec,
)

__all__ = [
    "EngineUnavailableError",
    "EntityBundle",
    "ExposureArrays",
    "HazardArrays",
    "ImpactFunctionSpec",
    "MeasureSpec",
    "assign_centroids",
    "build_exposures",
    "build_hazard",
    "build_impfset",
    "build_measure",
    "intensity_to_dense",
    "local_exceedance_imp",
    "run_cost_benefit",
    "run_impact",
]
