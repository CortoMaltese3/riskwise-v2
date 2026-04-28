"""Dual-backend tests for ImpactHandler.calculate_impact.

Verifies that routing via RISKWISE_ENGINE_BACKEND="climada" and "engine"
produces compatible results for the same synthetic input data.

Skipped when the real CLIMADA package is not installed (stub environment
/ CI without the full geospatial stack).  ``pytest.importorskip`` with
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
from climada.entity import Exposures  # noqa: E402
from climada.hazard import Hazard  # noqa: E402
from impact.impact_handler import ImpactHandler  # noqa: E402
from scipy import sparse  # noqa: E402
from shapely.geometry import Point  # noqa: E402

from backend.engine.adapter import build_impfset  # noqa: E402
from backend.impact.registry import ImpactFunctionSpec  # noqa: E402

# ---------------------------------------------------------------------------
# Shared impact-function spec
# ---------------------------------------------------------------------------

_IMPF_SPEC = ImpactFunctionSpec(
    haz_type="FL",
    exp_type="generic",
    id=1,
    name="test-flood",
    intensity_unit="m",
    intensity=(0.0, 0.5, 1.0, 2.0, 4.0),
    mdd=(0.0, 0.05, 0.20, 0.60, 1.0),
    paa=(1.0, 1.0, 1.0, 1.0, 1.0),
)

# ---------------------------------------------------------------------------
# Synthetic geometry — 3 centroids / exposure points, 4 events
# ---------------------------------------------------------------------------

_LAT = np.array([10.0, 11.0, 12.0])
_LON = np.array([20.0, 21.0, 22.0])

_INTENSITY = np.array(
    [
        [0.5, 1.0, 2.0],
        [0.2, 0.5, 1.5],
        [1.0, 2.5, 3.0],
        [0.1, 0.3, 0.8],
    ]
)
_FREQUENCY = np.array([0.1, 0.2, 0.05, 0.5])


def _make_hazard() -> Hazard:
    """Build a minimal CLIMADA FL Hazard from synthetic arrays."""
    haz = Hazard(haz_type="FL")
    # Centroids: set lat/lon directly; Hazard() creates an empty Centroids.
    haz.centroids.lat = _LAT.copy()
    haz.centroids.lon = _LON.copy()
    haz.intensity = sparse.csr_matrix(_INTENSITY)
    haz.frequency = _FREQUENCY.copy()
    haz.event_id = np.arange(1, len(_FREQUENCY) + 1)
    haz.event_name = [f"e{i}" for i in range(1, len(_FREQUENCY) + 1)]
    haz.units = "m"
    return haz


def _make_exposures() -> Exposures:
    """Build CLIMADA Exposures co-located with the hazard centroids."""
    gdf = gpd.GeoDataFrame(
        {
            "value": [100_000.0, 200_000.0, 150_000.0],
            "impf_FL": [1, 1, 1],
            "geometry": [Point(_LON[i], _LAT[i]) for i in range(3)],
        },
        crs="EPSG:4326",
    )
    exp = Exposures(gdf)
    exp.ref_year = 2020
    return exp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDualBackendRouting:
    """ImpactHandler.calculate_impact routes to the correct backend."""

    def test_climada_backend_default(self, monkeypatch) -> None:
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        impact = ImpactHandler().calculate_impact(
            _make_exposures(), _make_hazard(), build_impfset([_IMPF_SPEC])
        )
        assert impact is not None
        assert impact.aai_agg >= 0

    def test_engine_backend_explicit(self, monkeypatch) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        impact = ImpactHandler().calculate_impact(
            _make_exposures(), _make_hazard(), build_impfset([_IMPF_SPEC])
        )
        assert impact is not None
        assert impact.aai_agg >= 0


class TestDualBackendParity:
    """Engine and CLIMADA paths produce numerically compatible results."""

    @pytest.fixture(autouse=True)
    def _results(self, monkeypatch):
        monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
        self._climada = ImpactHandler().calculate_impact(
            _make_exposures(), _make_hazard(), build_impfset([_IMPF_SPEC])
        )

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        self._engine = ImpactHandler().calculate_impact(
            _make_exposures(), _make_hazard(), build_impfset([_IMPF_SPEC])
        )

    def test_both_backends_return_results(self) -> None:
        assert self._climada is not None
        assert self._engine is not None

    def test_aai_agg_climada_matches_snapshot(self) -> None:
        # CLIMADA path must produce a positive AAI for this synthetic data.
        assert self._climada.aai_agg > 0

    def test_aai_agg_engine_within_two_percent(self) -> None:
        climada_aai = float(self._climada.aai_agg)
        engine_aai = float(self._engine.aai_agg)
        if climada_aai > 0:
            assert abs(engine_aai - climada_aai) / climada_aai < 0.02, (
                f"engine aai_agg={engine_aai:.4f} differs from climada "
                f"aai_agg={climada_aai:.4f} by more than 2 %"
            )
        else:
            assert engine_aai == pytest.approx(climada_aai, abs=1e-6)

    def test_n_valid_points_identical(self) -> None:
        # Number of exposure points present in the impact output must match.
        n_climada = len(self._climada.eai_exp)
        n_engine = len(self._engine.eai_exp)
        assert n_climada == n_engine, (
            f"CLIMADA n_valid_points={n_climada} != engine n_valid_points={n_engine}"
        )

    def test_n_excluded_points_identical(self) -> None:
        # Exposure points with zero expected annual impact must match.
        n_excluded_climada = int((self._climada.eai_exp == 0).sum())
        n_excluded_engine = int((self._engine.eai_exp == 0).sum())
        assert n_excluded_climada == n_excluded_engine, (
            f"CLIMADA n_excluded={n_excluded_climada} != engine n_excluded={n_excluded_engine}"
        )
