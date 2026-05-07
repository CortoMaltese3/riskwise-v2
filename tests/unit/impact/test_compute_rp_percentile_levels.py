"""Regression test for the white-impact-map bug (round 2).

After the prior fix aligned ``imp_mat`` columns with ``valid_exposure_mask``,
``generate_impact_geojson`` cleared the column-stack error only to crash on
``np.percentile`` whenever a return period had no strictly-positive values
across the kept exposure points (e.g. low-intensity flood RPs against crops).
The handler swallowed the resulting ``IndexError`` and silently never wrote
``risks_geodata.json`` — the same white-map symptom from a different code
path.

This test pins the per-RP percentile helper's behavior on the empty slice so
the geojson is always emitted, even with degenerate impact data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend.impact.impact_handler import _compute_rp_percentile_levels


def test_returns_five_zeros_when_all_values_are_zero_for_an_rp() -> None:
    impact_gdf = pd.DataFrame({"rp10": [0.0, 0.0, 0.0], "rp25": [0.5, 1.0, 0.0]})

    levels = _compute_rp_percentile_levels(impact_gdf, (10, 25))

    assert levels["rp10"] == [0.0, 0.0, 0.0, 0.0, 0.0]
    # Non-empty RPs keep the leading 0 + four percentile levels.
    assert levels["rp25"][0] == 0
    assert len(levels["rp25"]) == 5


def test_returns_five_zeros_when_impact_gdf_is_empty() -> None:
    impact_gdf = pd.DataFrame({"rp10": [], "rp25": []}, dtype=np.float64)

    levels = _compute_rp_percentile_levels(impact_gdf, (10, 25))

    assert levels["rp10"] == [0.0, 0.0, 0.0, 0.0, 0.0]
    assert levels["rp25"] == [0.0, 0.0, 0.0, 0.0, 0.0]


def test_ignores_negative_and_zero_values_when_computing_percentiles() -> None:
    impact_gdf = pd.DataFrame({"rp50": [-1.0, 0.0, 1.0, 2.0, 3.0, 4.0]})

    levels = _compute_rp_percentile_levels(impact_gdf, (50,), percentiles=(50,))

    # Only positive values [1,2,3,4] feed into the percentile calc.
    assert levels["rp50"][0] == 0
    assert levels["rp50"][1] == round(float(np.percentile([1, 2, 3, 4], 50)), 1)
