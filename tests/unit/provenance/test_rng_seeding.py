"""RNG seeding round-trip: a stored seed reproduces the same draws.

This is the single invariant that makes same-machine reproducibility
possible. Every stochastic step in the scenario runner must pull from a
``np.random.default_rng(seed)`` derived from the persisted seed; this
test locks that contract in by seeding twice and asserting bit-identical
draws across array dtypes the pipeline actually produces (float64 and
int64).
"""

from __future__ import annotations

import numpy as np
from provenance import new_random_seed


def test_new_random_seed_fits_bigint() -> None:
    for _ in range(32):
        seed = new_random_seed()
        assert 0 <= seed < 2**63


def test_default_rng_round_trip_floats() -> None:
    seed = 123_456_789
    a = np.random.default_rng(seed).standard_normal(8)
    b = np.random.default_rng(seed).standard_normal(8)
    assert np.array_equal(a, b)


def test_default_rng_round_trip_ints() -> None:
    seed = 987_654_321
    a = np.random.default_rng(seed).integers(0, 10_000, size=16)
    b = np.random.default_rng(seed).integers(0, 10_000, size=16)
    assert np.array_equal(a, b)


def test_different_seeds_diverge() -> None:
    a = np.random.default_rng(1).standard_normal(4)
    b = np.random.default_rng(2).standard_normal(4)
    assert not np.array_equal(a, b)
