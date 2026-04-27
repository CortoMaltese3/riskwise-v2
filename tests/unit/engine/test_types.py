"""Tests for the domain dataclasses in :mod:`backend.engine.types`.

Locks in the three invariants the dataclasses are introduced for:

* picklability (workers serialize these across process boundaries),
* value-equality on identical content (handlers compare bundle inputs),
* immutability (frozen) so accidental field assignment fails loudly
  rather than silently desyncing two callers sharing a bundle.

Array-shaped fields are exercised with tuples, not numpy arrays, because
``np.ndarray.__eq__`` returns an array — meaningful equality on arrays
needs an explicit ``np.array_equal`` and is out of scope for these
boundary types.
"""

from __future__ import annotations

import pickle
from dataclasses import FrozenInstanceError

import pytest

from backend.engine.types import (
    EntityBundle,
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
    MeasureSpec,
)


def _make_hazard_arrays() -> HazardArrays:
    return HazardArrays(
        intensity=((0.5, 1.0), (1.5, 2.5)),
        frequency=(0.1, 0.01),
        centroid_lat=(37.9, 38.0),
        centroid_lon=(23.7, 23.8),
        haz_type="RF",
        intensity_unit="m",
        frequency_type="marginal",
        event_names=("RP-10", "RP-100"),
    )


def _make_exposure_arrays() -> ExposureArrays:
    return ExposureArrays(
        values=(100.0, 200.0, 300.0),
        centroid_idx=(0, 0, 1),
        impf_id=(1, 1, 1),
        lat=(37.9, 37.9, 38.0),
        lon=(23.7, 23.7, 23.8),
        value_unit="USD",
    )


def _make_impfspec() -> ImpactFunctionSpec:
    return ImpactFunctionSpec(
        haz_type="RF",
        exp_type="generic",
        id=1,
        name="test",
        intensity_unit="m",
        intensity=(0.0, 1.0, 2.0),
        mdd=(0.0, 0.5, 1.0),
        paa=(0.0, 1.0, 1.0),
    )


def _make_measure_spec() -> MeasureSpec:
    return MeasureSpec(
        name="seawall",
        haz_type="RF",
        cost=1_000_000.0,
        cost_unit="USD",
        hazard_inten_imp=0.5,
        mdd_impact_a=0.8,
        paa_impact_a=0.9,
    )


def _make_entity_bundle() -> EntityBundle:
    return EntityBundle(
        exposures=_make_exposure_arrays(),
        impfset_specs=[_make_impfspec()],
        measures=[_make_measure_spec()],
        discount_rate=0.02,
        ref_year=2024,
    )


@pytest.mark.parametrize(
    ("name", "factory"),
    [
        ("HazardArrays", _make_hazard_arrays),
        ("ExposureArrays", _make_exposure_arrays),
        ("MeasureSpec", _make_measure_spec),
        ("EntityBundle", _make_entity_bundle),
    ],
)
def test_pickle_round_trip_byte_equal(name: str, factory) -> None:
    obj = factory()
    payload = pickle.dumps(obj)
    restored = pickle.loads(payload)
    assert pickle.dumps(restored) == payload, f"{name} did not round-trip byte-equal"


def test_entity_bundle_value_equality() -> None:
    a = _make_entity_bundle()
    b = _make_entity_bundle()
    assert a is not b
    assert a == b


def test_entity_bundle_inequality_on_field_change() -> None:
    a = _make_entity_bundle()
    b = EntityBundle(
        exposures=a.exposures,
        impfset_specs=a.impfset_specs,
        measures=a.measures,
        discount_rate=a.discount_rate,
        ref_year=a.ref_year + 1,
    )
    assert a != b


@pytest.mark.parametrize(
    ("factory", "field_name", "new_value"),
    [
        (_make_hazard_arrays, "haz_type", "TC"),
        (_make_exposure_arrays, "value_unit", "EUR"),
        (_make_measure_spec, "cost", 0.0),
        (_make_entity_bundle, "ref_year", 2030),
    ],
)
def test_frozen_blocks_field_mutation(factory, field_name, new_value) -> None:
    obj = factory()
    with pytest.raises(FrozenInstanceError):
        setattr(obj, field_name, new_value)
