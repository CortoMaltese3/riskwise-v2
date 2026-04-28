"""Adapter for `climate-lama-engine` — the only module allowed to import it.

Per [DECISIONS.md D26](../../docs/DECISIONS.md) and ADR §5.1 rule 1
([adr-climate-lama-engine-adoption.md](../../docs/spikes/adr-climate-lama-engine-adoption.md)),
this is the single boundary between riskwise and the engine library.
Every other backend module routes through these helpers; the CI lint rule
in `scripts/check_engine_imports.py` enforces that no other file imports
from `climate_lama_engine.*`.

Input shapes are the frozen dataclasses defined in
:mod:`backend.engine.types`. Field names match the climate-lama
backbone's ``engine_adapter.py`` contract so the two consumer adapters
stay aligned.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.engine.types import (
    ExposureArrays,
    HazardArrays,
    ImpactFunctionSpec,
    MeasureSpec,
)

if TYPE_CHECKING:  # pragma: no cover
    import climate_lama_engine as cc


# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------


class EngineUnavailableError(RuntimeError):
    """Raised when `climate_lama_engine` is not importable.

    The message includes the install hint so a developer hitting this on a
    clean checkout knows exactly what to run.
    """


_INSTALL_HINT = "pip install climate-lama-engine==0.4.0"


def _import_engine() -> tuple[Any, Any]:
    """Lazy import of climate_lama_engine + numpy.

    Deferred so that `import backend.engine.adapter` succeeds on dev boxes
    that haven't installed the engine yet — the failure surfaces only when
    a function is actually called.
    """
    try:
        import climate_lama_engine as cc
        import numpy as np
    except ImportError as exc:
        raise EngineUnavailableError(
            f"climate-lama-engine is not installed. Run: {_INSTALL_HINT}"
        ) from exc
    return cc, np


# ---------------------------------------------------------------------------
# Public adapter functions
# ---------------------------------------------------------------------------


def build_hazard(arrays: HazardArrays) -> cc.Hazard:
    """Build a `climate_lama_engine.Hazard` from pre-loaded arrays.

    The arrays come from riskwise's hazard loaders (HDF5, GeoTIFF — wired
    in Phase 6 Track 2). This function does no I/O and no centroid
    assignment; both are upstream concerns.
    """
    cc, np = _import_engine()
    from scipy import sparse

    intensity = arrays.intensity
    if not isinstance(intensity, sparse.csr_matrix):
        intensity = sparse.csr_matrix(intensity)

    return cc.Hazard(
        haz_type=arrays.haz_type,
        intensity_unit=arrays.intensity_unit,
        intensity=intensity,
        frequency=np.asarray(arrays.frequency, dtype=np.float64),
        centroid_lat=np.asarray(arrays.centroid_lat, dtype=np.float64),
        centroid_lon=np.asarray(arrays.centroid_lon, dtype=np.float64),
        frequency_type=arrays.frequency_type,
        event_name=list(arrays.event_names) if arrays.event_names is not None else None,
    )


def build_exposures(arrays: ExposureArrays) -> cc.Exposures:
    """Build a `climate_lama_engine.Exposures` from pre-loaded arrays.

    `centroid_idx` is pre-assigned by the loader so this function performs
    no geographic lookup. Insurance fields (`deductible`, `cover`) are
    optional and only populated when the calling handler needs the
    insured-impact pathway.
    """
    cc, np = _import_engine()

    lat = arrays.lat
    lon = arrays.lon
    deductible = arrays.deductible
    cover = arrays.cover

    return cc.Exposures(
        value=np.asarray(arrays.values, dtype=np.float64),
        centroid_idx=np.asarray(arrays.centroid_idx, dtype=np.intp),
        impf_id=np.asarray(arrays.impf_id, dtype=np.int64),
        lat=np.asarray(lat, dtype=np.float64) if lat is not None else None,
        lon=np.asarray(lon, dtype=np.float64) if lon is not None else None,
        deductible=np.asarray(deductible, dtype=np.float64) if deductible is not None else None,
        cover=np.asarray(cover, dtype=np.float64) if cover is not None else None,
        value_unit=arrays.value_unit,
    )


def build_impfset(specs: list[ImpactFunctionSpec]) -> cc.ImpactFuncSet:
    """Build a `climate_lama_engine.ImpactFuncSet` from a list of curve specs."""
    cc, np = _import_engine()

    impfs = []
    for spec in specs:
        impfs.append(
            cc.ImpactFunc(
                id=spec.id,
                haz_type=spec.haz_type,
                intensity=np.asarray(spec.intensity, dtype=np.float64),
                mdd=np.asarray(spec.mdd, dtype=np.float64),
                paa=np.asarray(spec.paa, dtype=np.float64),
                intensity_unit=spec.intensity_unit,
                name=spec.name,
            )
        )
    return cc.ImpactFuncSet(impfs)


def _or(value: float | None, default: float) -> float:
    """Return ``value`` if not None, else ``default``. Used by ``build_measure``."""
    return default if value is None else value


def build_measure(spec: MeasureSpec) -> cc.Measure:
    """Build a `climate_lama_engine.Measure` from a domain measure spec.

    Mirrors the climate-lama backbone's `_build_measure` so both consumer
    adapters produce identical engine `Measure` objects from equivalent
    domain inputs.
    """
    cc, _np = _import_engine()

    return cc.Measure(
        name=spec.name,
        haz_type=spec.haz_type,
        cost=spec.cost,
        cost_unit=spec.cost_unit,
        freq_cutoff=spec.hazard_freq_cutoff,
        haz_inten_a=_or(spec.hazard_inten_imp, 1.0),
        haz_inten_b=0.0,
        mdd_a=_or(spec.mdd_impact_a, 1.0),
        mdd_b=_or(spec.mdd_impact_b, 0.0),
        paa_a=_or(spec.paa_impact_a, 1.0),
        paa_b=_or(spec.paa_impact_b, 0.0),
    )


def hazard_from_rp_maps(
    *,
    haz_type: str,
    intensity_unit: str,
    return_periods: Any,
    intensity: Any,
    centroid_lat: Any,
    centroid_lon: Any,
) -> cc.Hazard:
    """Build a `climate_lama_engine.Hazard` from RP-banded intensity maps.

    Thin pass-through to :meth:`climate_lama_engine.Hazard.from_rp_maps`
    so the GeoTIFF loader (and any future RP-based loader) can consume
    the engine's marginal-frequency math without importing the engine
    itself — the engine-import lint only allows `backend/engine/*`, and
    keeping the call-out here means the loader stays expressed in plain
    domain types.
    """
    cc, np = _import_engine()
    from scipy import sparse

    if not isinstance(intensity, sparse.csr_matrix):
        intensity = sparse.csr_matrix(intensity)

    return cc.Hazard.from_rp_maps(
        haz_type=haz_type,
        intensity_unit=intensity_unit,
        return_periods=np.asarray(return_periods, dtype=float),
        intensity=intensity,
        centroid_lat=np.asarray(centroid_lat, dtype=np.float64),
        centroid_lon=np.asarray(centroid_lon, dtype=np.float64),
    )


def run_impact(
    hazard: cc.Hazard,
    exposures: cc.Exposures,
    impfset: cc.ImpactFuncSet,
    *,
    save_mat: bool = False,
) -> cc.Impact:
    """Run an impact calculation. Returns the engine's `Impact` directly.

    Result transformation (e.g. building riskwise's domain
    `ImpactResult`) is left to the calling handler — this function stays
    on the engine side of the boundary.
    """
    cc, _np = _import_engine()
    return cc.ImpactCalc(hazard, exposures, impfset).impact(save_mat=save_mat)


def run_cost_benefit(
    hazard_present: cc.Hazard,
    hazard_future: cc.Hazard,
    exposures: cc.Exposures,
    impfset: cc.ImpactFuncSet,
    measures: list[cc.Measure],
    discount_rate: float,
    present_year: int,
    future_year: int,
) -> list[cc.CostBenefitResult]:
    """Run a cost-benefit calculation for a list of adaptation measures.

    Returns the engine's per-measure `CostBenefitResult` list directly;
    the consuming handler maps it onto riskwise's domain shape.
    """
    cc, _np = _import_engine()
    return cc.calc_cost_benefit(
        hazard_present=hazard_present,
        hazard_future=hazard_future,
        exposures=exposures,
        impfset=impfset,
        measures=measures,
        discount_rate=discount_rate,
        present_year=present_year,
        future_year=future_year,
    )
