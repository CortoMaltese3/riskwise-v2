"""Tests for ``backend.engine.adapter.local_exceedance_imp``.

Engine ``Impact`` exposes a global ``calc_freq_curve`` but no per-point
exceedance method, so riskwise computes per-exposure return-period
intensities from ``imp_mat`` + ``frequency``. These tests pin the
algorithm: sort events descending, cumulative-frequency exceedance
curve, interpolate to ``1/return_period``.
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.engine.adapter import local_exceedance_imp


def test_single_point_two_events_interpolation() -> None:
    # Two events at one point: impact (10, 100), frequency (0.1, 0.01).
    # Sorted desc: [100, 10]; cum_freq: [0.01, 0.11].
    # RP 100 → target_freq 0.01 → exact match → impact 100.
    # RP 10  → target_freq 0.1  → between cum_freq 0.01 and 0.11 → interp.
    #     fraction = (0.1 - 0.01) / (0.11 - 0.01) = 0.9
    #     impact = 100 + 0.9 * (10 - 100) = 19.0
    imp_mat = np.array([[10.0], [100.0]])
    freq = np.array([0.1, 0.01])
    out = local_exceedance_imp(imp_mat, freq, [100, 10])
    np.testing.assert_allclose(out[:, 0], [100.0, 19.0])


def test_zero_only_column_yields_zeros() -> None:
    imp_mat = np.zeros((3, 2))
    imp_mat[:, 0] = [1.0, 2.0, 3.0]
    freq = np.array([0.5, 0.2, 0.05])
    out = local_exceedance_imp(imp_mat, freq, [50, 10])
    # Column 0: real values; column 1: all zeros → row stays zeros.
    np.testing.assert_array_equal(out[:, 1], [0.0, 0.0])
    assert np.all(out[:, 0] >= 0)


def test_accepts_sparse_matrix() -> None:
    sparse = pytest.importorskip("scipy.sparse")
    imp_mat = sparse.csr_matrix(np.array([[10.0], [100.0]]))
    freq = np.array([0.1, 0.01])
    out = local_exceedance_imp(imp_mat, freq, [100])
    np.testing.assert_allclose(out[:, 0], [100.0])


def test_output_shape_matches_rps_x_points() -> None:
    n_events, n_points = 4, 5
    imp_mat = np.random.default_rng(0).uniform(size=(n_events, n_points))
    freq = np.full(n_events, 0.1)
    out = local_exceedance_imp(imp_mat, freq, [10, 25, 50])
    assert out.shape == (3, n_points)
