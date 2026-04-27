"""Smoke test for the climate-lama-engine adapter.

The point of this test is structural — confirm the adapter wires up
correctly against a real `climate_lama_engine` install. The numerical
parity test suite lives in the engine repo
(`notebooks/08_climada_comparison.ipynb`); see
`docs/spikes/parity-smoke-results.md`.

Skipped on dev boxes that don't have `climate_lama_engine` installed
(`pytest.importorskip` — same pattern as the minisign-gated test).
"""

from __future__ import annotations

import numpy as np
import pytest

pytest.importorskip("climate_lama_engine")
pytest.importorskip("scipy")

from scipy import sparse  # noqa: E402  — must come after importorskip

from backend.engine import (
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
    build_exposures,
    build_hazard,
    build_impfset,
    run_impact,
)


def test_run_impact_smoke() -> None:
    # 3 events × 2 centroids — minimal shape that exercises the
    # event/centroid loop without being a degenerate single-event case.
    intensity = sparse.csr_matrix(
        np.array(
            [
                [0.5, 1.0],
                [1.5, 2.5],
                [3.0, 4.0],
            ]
        )
    )

    hazard_arrays: HazardArrays = {
        "intensity": intensity,
        "frequency": np.array([0.1, 0.01, 0.002]),
        "centroid_lat": np.array([37.9, 38.0]),
        "centroid_lon": np.array([23.7, 23.8]),
        "haz_type": "RF",
        "intensity_unit": "m",
        "frequency_type": "marginal",
        "event_names": ["RP-10", "RP-100", "RP-500"],
    }

    # 5 assets distributed across the 2 centroids.
    exposure_arrays: ExposureArrays = {
        "values": np.array([100_000.0, 200_000.0, 300_000.0, 400_000.0, 500_000.0]),
        "centroid_idx": np.array([0, 0, 1, 1, 1]),
        "impf_id": np.array([1, 1, 1, 1, 1]),
        "lat": np.array([37.9, 37.9, 38.0, 38.0, 38.0]),
        "lon": np.array([23.7, 23.7, 23.8, 23.8, 23.8]),
        "value_unit": "USD",
    }

    impf_spec: ImpactFunctionSpec = {
        "id": 1,
        "haz_type": "RF",
        "intensity": [0.0, 0.5, 1.0, 2.0, 3.0, 5.0],
        "mdd": [0.0, 0.02, 0.07, 0.25, 0.50, 0.80],
        "paa": [0.0, 0.20, 0.40, 0.70, 0.90, 1.00],
        "intensity_unit": "m",
    }

    hazard = build_hazard(hazard_arrays)
    exposures = build_exposures(exposure_arrays)
    impfset = build_impfset([impf_spec])

    impact = run_impact(hazard, exposures, impfset)

    assert impact.aai_agg > 0
    assert impact.at_event.shape[0] == 3
