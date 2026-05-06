"""Tests for :meth:`EntityHandler.get_future_entity`.

After Phase 6, ``EntityBundle`` and ``ExposureArrays`` are frozen
dataclasses, so :meth:`get_future_entity` must return a *new* bundle
via :func:`dataclasses.replace`. The original input must remain
untouched.
"""

from __future__ import annotations

import numpy as np

from backend.engine.types import EntityBundle, ExposureArrays, ImpactFunctionSpec, MeasureSpec
from backend.entity.entity_handler import EntityHandler


def _bundle(values: list[float], ref_year: int = 2020) -> EntityBundle:
    exposures = ExposureArrays(
        values=np.asarray(values, dtype=np.float64),
        centroid_idx=np.arange(len(values), dtype=np.intp),
        impf_id=np.ones(len(values), dtype=np.int64),
        lat=np.zeros(len(values)),
        lon=np.zeros(len(values)),
    )
    impfset_specs = [
        ImpactFunctionSpec(
            haz_type="FL",
            exp_type="generic",
            id=1,
            name="generic",
            intensity_unit="m",
            intensity=(0.0, 1.0),
            mdd=(0.0, 1.0),
            paa=(0.0, 1.0),
        )
    ]
    measures = [MeasureSpec(name="m1", haz_type="FL")]
    return EntityBundle(
        exposures=exposures,
        impfset_specs=impfset_specs,
        measures=measures,
        discount_rate=0.03,
        ref_year=ref_year,
    )


def test_returns_new_instance() -> None:
    entity = _bundle([100.0, 200.0])
    future = EntityHandler().get_future_entity(entity, future_year=2050, aag=0.02)
    assert future is not entity
    assert future.exposures is not entity.exposures


def test_values_scaled_by_growth_multiplier() -> None:
    entity = _bundle([100.0, 200.0])
    future = EntityHandler().get_future_entity(entity, future_year=2050, aag=0.02)
    expected = np.array([100.0, 200.0]) * (1.02**30)
    np.testing.assert_allclose(future.exposures.values, expected)


def test_ref_year_updated() -> None:
    entity = _bundle([1.0])
    future = EntityHandler().get_future_entity(entity, future_year=2050, aag=0.02)
    assert future.ref_year == 2050


def test_input_unchanged() -> None:
    entity = _bundle([100.0, 200.0])
    original_values = entity.exposures.values.copy()
    EntityHandler().get_future_entity(entity, future_year=2050, aag=0.02)
    np.testing.assert_array_equal(entity.exposures.values, original_values)
    assert entity.ref_year == 2020


def test_preserves_specs_measures_and_discount() -> None:
    entity = _bundle([1.0])
    future = EntityHandler().get_future_entity(entity, future_year=2050, aag=0.02)
    assert future.impfset_specs == entity.impfset_specs
    assert future.measures == entity.measures
    assert future.discount_rate == entity.discount_rate


def test_zero_growth_produces_identity_values() -> None:
    entity = _bundle([42.0, 7.0])
    future = EntityHandler().get_future_entity(entity, future_year=2050, aag=0.0)
    np.testing.assert_array_equal(future.exposures.values, entity.exposures.values)


def test_returns_none_on_invalid_input() -> None:
    # ``aag`` of None raises a TypeError inside the multiplier; handler
    # should swallow and return None per its long-standing contract.
    out = EntityHandler().get_future_entity(_bundle([1.0]), future_year=2050, aag=None)
    assert out is None
