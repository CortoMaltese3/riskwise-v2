"""Tests for the historical cost-benefit path.

Historical runs (``scenario == "historical"``) pass ``hazard_future=None``.
The handler still produces per-measure benefits by reusing ``hazard_present``
as the future hazard — the engine's per-year benefit collapses to
``avoided_present`` (since ``avoided_future = avoided_present`` when the
hazards are identical), and the benefit is then ``avoided_present`` summed
over the run's time horizon with growth and discounting applied.

These tests stub the engine adapter so they don't require
``climate_lama_engine`` to be installed.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.costben.costben_handler import CostBenefitHandler
from backend.engine.types import CostBenefitResult


def _entity_with_measures():
    """Minimal stand-in entity that survives ``_calculate_via_engine``.

    The adapter reads ``exposures``, ``impfset_specs``, ``measures``,
    ``discount_rate``, and ``ref_year``. With every adapter helper
    mocked, the field values are irrelevant — only their presence and
    iterability matter.
    """
    return SimpleNamespace(
        exposures=object(),
        impfset_specs=[object()],
        measures=[object()],
        discount_rate=0.02,
        ref_year=2020,
    )


@pytest.fixture
def patched_adapter(monkeypatch: pytest.MonkeyPatch):
    """Stub every adapter helper imported inside ``_calculate_via_engine``.

    Returns the ``run_cost_benefit`` mock so individual tests can stage its
    return value and inspect the keyword arguments it was called with.
    """
    import backend.engine.adapter as adapter

    run_cost_benefit_mock = MagicMock(name="run_cost_benefit", return_value=[])
    monkeypatch.setattr(adapter, "assign_centroids", lambda exposures, hazard: exposures)
    monkeypatch.setattr(adapter, "build_exposures", lambda exposures: exposures)
    monkeypatch.setattr(adapter, "build_hazard", lambda hazard: hazard)
    monkeypatch.setattr(adapter, "build_impfset", lambda specs: specs)
    monkeypatch.setattr(adapter, "build_measure", lambda spec: spec)
    monkeypatch.setattr(adapter, "run_cost_benefit", run_cost_benefit_mock)
    return run_cost_benefit_mock


def test_historical_run_with_measures_invokes_engine_with_present_hazard_as_future(
    patched_adapter: MagicMock,
) -> None:
    """``hazard_future=None`` ⇒ engine is invoked with ``hazard_present`` for both endpoints."""
    handler = CostBenefitHandler()
    hazard_present = object()

    handler.calculate_cost_benefit(
        hazard_present=hazard_present,
        entity_present=_entity_with_measures(),
        hazard_future=None,
        future_year=2050,
    )

    patched_adapter.assert_called_once()
    kwargs = patched_adapter.call_args.kwargs
    assert kwargs["hazard_present"] is hazard_present
    assert kwargs["hazard_future"] is hazard_present
    assert kwargs["present_year"] == 2020
    assert kwargs["future_year"] == 2050


def test_historical_run_with_measures_returns_non_empty_results(
    patched_adapter: MagicMock,
) -> None:
    """A single engine result is normalised into a one-element ``list[CostBenefitResult]``."""
    patched_adapter.return_value = [
        SimpleNamespace(
            measure_name="Seawall",
            cost=1_000_000.0,
            benefit=2_500_000.0,
            bcr=2.5,
            risk_baseline_present=10_000.0,
            risk_baseline_future=10_000.0,
        )
    ]
    handler = CostBenefitHandler()

    results = handler.calculate_cost_benefit(
        hazard_present=object(),
        entity_present=_entity_with_measures(),
        hazard_future=None,
        future_year=2050,
    )

    assert len(results) == 1
    result = results[0]
    assert isinstance(result, CostBenefitResult)
    assert result.name == "Seawall"
    assert result.cost == 1_000_000.0
    assert result.benefit == 2_500_000.0
    assert result.bcr == 2.5


def test_zero_measures_returns_empty_even_with_future() -> None:
    """Zero measures short-circuits before the engine adapter is touched."""
    handler = CostBenefitHandler()
    result = handler.calculate_cost_benefit(
        hazard_present=object(),
        entity_present=SimpleNamespace(measures=[]),
        hazard_future=object(),
        future_year=2050,
    )
    assert result == []
