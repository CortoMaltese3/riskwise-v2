"""Stability tests for :func:`provenance.canonical_json_sha256`.

The canonical form pins dict ordering and float precision so the hash is
identical across BLAS vendors and insertion orders. Any regression here
silently invalidates every persisted provenance hash, so the coverage is
mechanical and exhaustive for the documented invariants.
"""

from __future__ import annotations

import math

from provenance import canonical_json_sha256


def test_stable_across_key_order() -> None:
    a = {"x": 1, "y": 2, "z": 3}
    b = {"z": 3, "x": 1, "y": 2}
    assert canonical_json_sha256(a) == canonical_json_sha256(b)


def test_tuple_and_list_hash_equal() -> None:
    assert canonical_json_sha256((1, 2, 3)) == canonical_json_sha256([1, 2, 3])


def test_nested_payload_is_normalised() -> None:
    payload = {"runs": [{"aal": 1.234567890123, "rp": [10, 100, 1000]}]}
    same = {"runs": [{"rp": [10, 100, 1000], "aal": 1.234567890123}]}
    assert canonical_json_sha256(payload) == canonical_json_sha256(same)


def test_floats_rounded_to_fixed_precision() -> None:
    # Within 12 fractional digits → same hash. Beyond → different because
    # the canonical rounding still separates distinct values.
    assert canonical_json_sha256({"a": 1.0}) == canonical_json_sha256({"a": 1.0000000000001})
    assert canonical_json_sha256({"a": 1.00001}) != canonical_json_sha256({"a": 1.00002})


def test_signed_zero_normalised() -> None:
    # ``-0.0`` and ``0.0`` compare equal as floats; the canonical form
    # must not leak the sign bit through the JSON serialisation.
    assert canonical_json_sha256({"a": 0.0}) == canonical_json_sha256({"a": -0.0})


def test_nan_and_inf_not_supported() -> None:
    # json.dumps with allow_nan=True is the default but we use default
    # settings; ``float('nan')`` should raise via the underlying dumps.
    import pytest

    with pytest.raises(ValueError):
        canonical_json_sha256({"a": math.nan})
