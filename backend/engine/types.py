"""Domain dataclasses for the engine adapter boundary.

These are the riskwise-side input shapes consumed by ``backend.engine.adapter``.
They replace the placeholder ``TypedDict``s from #151 and play the
aggregator role on the riskwise side without coupling handler code to
``climate_lama_engine`` types.

``ImpactFunctionSpec`` already lives in :mod:`backend.impact.registry`
(it predates this module and is the validated row type produced when the
per-country JSON registries are loaded). It is re-exported here so the
adapter and downstream callers can import every boundary type from one
place. The direction matters: ``backend.impact.registry`` does not import
from ``backend.engine``, so re-exporting from here is cycle-free; moving
the spec into this module would force the registry to import from
``backend.engine``, which inverts the dependency direction and would
break the engine-import lint in :mod:`scripts.check_engine_imports`.

The array-shaped fields (``intensity``, ``frequency``, ``values``, ...)
are typed ``Any`` because they may be passed as ``np.ndarray``,
``scipy.sparse.csr_matrix``, tuple, or list — the adapter calls
``np.asarray`` / ``sparse.csr_matrix`` to coerce on the way to the
engine. Equality on dataclass instances containing numpy arrays is not
meaningful (``arr == arr`` returns an array, not a bool); callers that
need value-equality should construct the dataclasses with hashable
sequences such as tuples.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from backend.impact.registry import ImpactFunctionSpec

__all__ = [
    "CostBenefitResult",
    "EntityBundle",
    "ExposureArrays",
    "HazardArrays",
    "ImpactFunctionSpec",
    "MeasureSpec",
]


@dataclass(frozen=True)
class HazardArrays:
    """Pre-loaded hazard arrays — riskwise mirror of the backbone adapter contract."""

    intensity: Any
    frequency: Any
    centroid_lat: Any
    centroid_lon: Any
    haz_type: str = "RF"
    intensity_unit: str = "m"
    frequency_type: str = "occurrence"
    event_names: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ExposureArrays:
    """Pre-loaded exposure arrays. Centroid indices are pre-assigned by the loader."""

    values: Any
    centroid_idx: Any
    impf_id: Any
    lat: Any | None = None
    lon: Any | None = None
    deductible: Any | None = None
    cover: Any | None = None
    value_unit: str = "USD"


@dataclass(frozen=True)
class MeasureSpec:
    """Adaptation measure spec — domain shape for the engine's ``Measure`` dataclass.

    Field names mirror the climate-lama backbone so both consumer adapters
    can be fed equivalent domain inputs.
    """

    name: str
    haz_type: str
    cost: float = 0.0
    cost_unit: str = "USD"
    hazard_freq_cutoff: float | None = None
    hazard_inten_imp: float | None = None
    mdd_impact_a: float | None = None
    mdd_impact_b: float | None = None
    paa_impact_a: float | None = None
    paa_impact_b: float | None = None


@dataclass(frozen=True)
class CostBenefitResult:
    """Per-measure cost-benefit result — riskwise mirror of the engine's shape.

    The handler returns ``list[CostBenefitResult]`` for both backends so the
    JSON serializer and downstream consumers don't branch on the source.
    ``bcr`` is benefit/cost (the ranking-friendly direction); CLIMADA's
    ``cost_ben_ratio`` is the reciprocal and gets inverted at the boundary.
    ``risk_baseline_present`` / ``risk_baseline_future`` are the no-measure
    expected annual impacts used by the waterfall payload.
    """

    name: str
    cost: float
    benefit: float
    bcr: float
    risk_baseline_present: float
    risk_baseline_future: float


@dataclass(frozen=True)
class EntityBundle:
    """Aggregator equivalent to CLIMADA's ``Entity`` — packs everything a
    handler needs to drive an impact or cost-benefit run on the riskwise
    side, without leaking engine types into handler code.
    """

    exposures: ExposureArrays
    impfset_specs: list[ImpactFunctionSpec] = field(default_factory=list)
    measures: list[MeasureSpec] = field(default_factory=list)
    discount_rate: float = 0.02
    ref_year: int = 2020
