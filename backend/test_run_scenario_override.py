"""Tests for the runner-side editable-IF override (issue #453).

These tests target :func:`backend.impact.overrides.apply_impact_function_override`
directly so they stay fast and CI-light — the helper deliberately lives
outside ``backend.run_scenario`` so it can be exercised without pulling
CLIMADA / geopandas through the scenario handlers' imports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from unittest.mock import MagicMock

from backend.engine.types import ExposureArrays, ImpactFunctionSpec
from backend.impact.overrides import apply_impact_function_override


@dataclass(frozen=True)
class _StubEntity:
    """Minimal dataclass entity surface — enough for the helper."""

    exposures: ExposureArrays
    impfset_specs: list[ImpactFunctionSpec] = field(default_factory=list)


def _spec(haz_type: str, exp_type: str, id_: int, mdd: tuple[float, ...]) -> ImpactFunctionSpec:
    return ImpactFunctionSpec(
        haz_type=haz_type,
        exp_type=exp_type,
        id=id_,
        name=f"orig-{id_}",
        intensity_unit="m",
        intensity=(0.0, 0.5, 1.0, 2.0),
        mdd=mdd,
        paa=(1.0, 1.0, 1.0, 1.0),
    )


def _override(haz_type: str = "FL", exp_type: str = "crops", id_: int = 101) -> dict:
    return {
        "haz_type": haz_type,
        "exp_type": exp_type,
        "id": id_,
        "name": "edited",
        "intensity_unit": "m",
        "intensity": [0.0, 0.5, 1.0, 2.0],
        "mdd": [0.0, 0.3, 0.7, 1.0],
        "paa": [1.0, 1.0, 1.0, 1.0],
    }


def test_apply_override_patches_matching_spec_by_haz_and_id() -> None:
    exposures = ExposureArrays(values=[1.0], centroid_idx=[0], impf_id=[101])
    entity = _StubEntity(
        exposures=exposures,
        impfset_specs=[
            _spec("FL", "crops", 101, mdd=(0.0, 0.2, 0.5, 1.0)),
            _spec("FL", "students", 102, mdd=(0.0, 0.1, 0.3, 0.6)),
        ],
    )

    patched = apply_impact_function_override(entity, _override(id_=101), logger=MagicMock())

    assert len(patched.impfset_specs) == 2
    # The crops spec gets replaced with the edited curve...
    crops = next(s for s in patched.impfset_specs if s.id == 101)
    assert crops.mdd == (0.0, 0.3, 0.7, 1.0)
    # ...while the other spec is left intact so the engine resolves an
    # unrelated exposure exactly as it did before.
    students = next(s for s in patched.impfset_specs if s.id == 102)
    assert students.mdd == (0.0, 0.1, 0.3, 0.6)


def test_apply_override_appends_when_no_match() -> None:
    exposures = ExposureArrays(values=[1.0], centroid_idx=[0], impf_id=[101])
    entity = _StubEntity(
        exposures=exposures,
        impfset_specs=[_spec("FL", "crops", 101, mdd=(0.0, 0.2, 0.5, 1.0))],
    )

    patched = apply_impact_function_override(
        entity, _override(haz_type="TC", id_=999), logger=MagicMock()
    )

    assert len(patched.impfset_specs) == 2
    appended = next(s for s in patched.impfset_specs if s.haz_type == "TC")
    assert appended.mdd == (0.0, 0.3, 0.7, 1.0)


def test_apply_override_preserves_entity_immutability() -> None:
    # Sanity: the helper returns a new dataclass instance and does not
    # mutate the original tuple of specs — the on-disk XLSX is never the
    # source of truth for the patched curve, but neither should the
    # in-memory original be mutated for downstream consumers.
    exposures = ExposureArrays(values=[1.0], centroid_idx=[0], impf_id=[101])
    original_specs = [_spec("FL", "crops", 101, mdd=(0.0, 0.2, 0.5, 1.0))]
    entity = _StubEntity(exposures=exposures, impfset_specs=original_specs)

    apply_impact_function_override(entity, _override(), logger=MagicMock())

    assert entity.impfset_specs is original_specs
    assert entity.impfset_specs[0].mdd == (0.0, 0.2, 0.5, 1.0)
