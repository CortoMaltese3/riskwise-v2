"""Dual-backend tests for ``CostBenefitHandler.calculate_cost_benefit``.

Verifies that routing via ``RISKWISE_ENGINE_BACKEND="climada"`` and
``"engine"`` produces compatible per-measure results for the same synthetic
input data: cost / benefit / bcr agree within ±5 % and the no-measure
baseline risks agree within ±2 %. Also verifies that an entity with no
measures returns an empty list under both branches without raising.

Skipped when the real CLIMADA package is not installed (stub environment
/ CI without the full geospatial stack). ``pytest.importorskip`` with
``minversion`` distinguishes the real package from the conftest stubs,
which have no ``__version__`` attribute.
"""

from __future__ import annotations

import numpy as np
import pytest

# Require the real CLIMADA (not the conftest stub, which has no __version__).
pytest.importorskip("climada", minversion="1.0")
pytest.importorskip("climate_lama_engine")
pytest.importorskip("scipy")

import geopandas as gpd  # noqa: E402
from climada.entity import (  # noqa: E402
    DiscRates,
    Entity,
    Exposures,
    ImpactFunc,
    ImpactFuncSet,
    Measure,
    MeasureSet,
)
from climada.hazard import Hazard  # noqa: E402
from costben.costben_handler import CostBenefitHandler  # noqa: E402
from scipy import sparse  # noqa: E402
from shapely.geometry import Point  # noqa: E402

# ---------------------------------------------------------------------------
# Synthetic geometry — 4 centroids / exposure points, 5 events
# ---------------------------------------------------------------------------

_LAT = np.array([10.0, 11.0, 12.0, 13.0])
_LON = np.array([20.0, 21.0, 22.0, 23.0])

_INTENSITY_PRESENT = np.array(
    [
        [0.5, 1.0, 2.0, 0.8],
        [0.2, 0.5, 1.5, 0.4],
        [1.0, 2.5, 3.0, 1.5],
        [0.1, 0.3, 0.8, 0.2],
        [0.7, 1.2, 2.2, 1.0],
    ]
)
_FREQUENCY = np.array([0.1, 0.2, 0.05, 0.5, 0.1])

# Future hazard is a small uplift over present so risk_future > risk_present.
_INTENSITY_FUTURE = _INTENSITY_PRESENT * 1.2

_PRESENT_YEAR = 2020
_FUTURE_YEAR = 2050


def _make_hazard(intensity: np.ndarray) -> Hazard:
    haz = Hazard(haz_type="FL")
    haz.centroids.lat = _LAT.copy()
    haz.centroids.lon = _LON.copy()
    haz.intensity = sparse.csr_matrix(intensity)
    haz.frequency = _FREQUENCY.copy()
    haz.event_id = np.arange(1, len(_FREQUENCY) + 1)
    haz.event_name = [f"e{i}" for i in range(1, len(_FREQUENCY) + 1)]
    haz.units = "m"
    return haz


def _make_impfset() -> ImpactFuncSet:
    impf = ImpactFunc()
    impf.haz_type = "FL"
    impf.id = 1
    impf.name = "test-flood"
    impf.intensity_unit = "m"
    impf.intensity = np.array([0.0, 0.5, 1.0, 2.0, 4.0])
    impf.mdd = np.array([0.0, 0.05, 0.20, 0.60, 1.0])
    impf.paa = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
    impfset = ImpactFuncSet([impf])
    return impfset


def _make_exposures(ref_year: int) -> Exposures:
    gdf = gpd.GeoDataFrame(
        {
            "value": [100_000.0, 200_000.0, 150_000.0, 120_000.0],
            "impf_FL": [1, 1, 1, 1],
            "geometry": [Point(_LON[i], _LAT[i]) for i in range(4)],
        },
        crs="EPSG:4326",
    )
    exp = Exposures(gdf)
    exp.ref_year = ref_year
    return exp


def _make_measure(
    name: str,
    cost: float,
    hazard_inten_imp_a: float,
    mdd_a: float,
) -> Measure:
    m = Measure()
    m.name = name
    m.haz_type = "FL"
    m.cost = cost
    m.hazard_inten_imp = (hazard_inten_imp_a, 0.0)
    m.mdd_impact = (mdd_a, 0.0)
    m.paa_impact = (1.0, 0.0)
    return m


def _make_measure_set(empty: bool = False) -> MeasureSet:
    ms = MeasureSet()
    if empty:
        return ms
    # Two synthetic measures with different cost/effectiveness profiles.
    ms.append(_make_measure("attenuate_25", cost=1_000_000.0, hazard_inten_imp_a=0.75, mdd_a=1.0))
    ms.append(_make_measure("partial_relief", cost=500_000.0, hazard_inten_imp_a=1.0, mdd_a=0.7))
    return ms


def _make_disc_rates() -> DiscRates:
    dr = DiscRates()
    dr.years = np.arange(_PRESENT_YEAR, _FUTURE_YEAR + 1)
    dr.rates = np.full_like(dr.years, fill_value=0.02, dtype=np.float64)
    return dr


def _make_entity(ref_year: int, with_measures: bool = True) -> Entity:
    ent = Entity(
        exposures=_make_exposures(ref_year),
        impact_func_set=_make_impfset(),
        measure_set=_make_measure_set(empty=not with_measures),
        disc_rates=_make_disc_rates(),
    )
    return ent


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDualBackendRouting:
    """``CostBenefitHandler.calculate_cost_benefit`` routes to the correct backend."""

    def test_climada_backend_default(self, monkeypatch) -> None:
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        results = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR),
            _FUTURE_YEAR,
        )
        assert isinstance(results, list)
        assert len(results) == 2

    def test_engine_backend_explicit(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        results = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR),
            _FUTURE_YEAR,
        )
        assert isinstance(results, list)
        assert len(results) == 2


class TestEmptyMeasures:
    """With zero measures, both branches return an empty list without raising."""

    def test_climada_branch_empty_measures(self, monkeypatch) -> None:
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        results = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR, with_measures=False),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR, with_measures=False),
            _FUTURE_YEAR,
        )
        assert results == []

    def test_engine_branch_empty_measures(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        results = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR, with_measures=False),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR, with_measures=False),
            _FUTURE_YEAR,
        )
        assert results == []


class TestDualBackendParity:
    """Engine and CLIMADA paths produce numerically compatible results."""

    @pytest.fixture(autouse=True)
    def _results(self, monkeypatch):
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        self._climada = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR),
            _FUTURE_YEAR,
        )

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        self._engine = CostBenefitHandler().calculate_cost_benefit(
            _make_hazard(_INTENSITY_PRESENT),
            _make_entity(_PRESENT_YEAR),
            _make_hazard(_INTENSITY_FUTURE),
            _make_entity(_FUTURE_YEAR),
            _FUTURE_YEAR,
        )

    def test_same_number_of_results(self) -> None:
        assert len(self._climada) == len(self._engine)
        assert len(self._climada) > 0

    def test_baseline_present_within_two_percent(self) -> None:
        c = float(self._climada[0].risk_baseline_present)
        e = float(self._engine[0].risk_baseline_present)
        assert c > 0
        assert abs(e - c) / c < 0.02, (
            f"engine risk_baseline_present={e:.4f} differs from climada "
            f"risk_baseline_present={c:.4f} by more than 2 %"
        )

    def test_baseline_future_within_two_percent(self) -> None:
        c = float(self._climada[0].risk_baseline_future)
        e = float(self._engine[0].risk_baseline_future)
        assert c > 0
        assert abs(e - c) / c < 0.02, (
            f"engine risk_baseline_future={e:.4f} differs from climada "
            f"risk_baseline_future={c:.4f} by more than 2 %"
        )

    def test_per_measure_cost_benefit_bcr_within_five_percent(self) -> None:
        # Pair results by measure name so we tolerate any ordering difference.
        climada_by_name = {r.name: r for r in self._climada}
        engine_by_name = {r.name: r for r in self._engine}
        assert set(climada_by_name) == set(engine_by_name)

        for name, c in climada_by_name.items():
            e = engine_by_name[name]
            for field in ("cost", "benefit", "bcr"):
                cv = float(getattr(c, field))
                ev = float(getattr(e, field))
                if cv == 0:
                    assert abs(ev) < 1e-9, (
                        f"measure {name!r} field {field}: engine={ev} but climada=0"
                    )
                else:
                    assert abs(ev - cv) / abs(cv) < 0.05, (
                        f"measure {name!r} field {field}: engine={ev:.4f} differs "
                        f"from climada={cv:.4f} by more than 5 %"
                    )
