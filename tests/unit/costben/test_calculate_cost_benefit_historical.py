"""Regression test for the historical cost-benefit short-circuit.

For historical runs the scenario runner passes ``hazard_future=None`` /
``entity_future=None`` because there is no future projection to compare
against. The engine's ``calc_cost_benefit`` then divides by zero when
the same hazard stands in for both endpoints, so the handler returns an
empty list before reaching the engine. Live engine import is not
required to verify this — the early return precedes ``_import_engine``.
"""

from __future__ import annotations

from types import SimpleNamespace

from backend.costben.costben_handler import CostBenefitHandler


def _entity_with_measures():
    """Minimal stand-in: ``_has_measures`` only checks ``len(entity.measures) > 0``."""
    return SimpleNamespace(measures=[object()])


def test_historical_run_returns_empty_without_invoking_engine() -> None:
    handler = CostBenefitHandler()
    result = handler.calculate_cost_benefit(
        hazard_present=object(),
        entity_present=_entity_with_measures(),
        hazard_future=None,
        entity_future=None,
        future_year=2050,
    )
    assert result == []


def test_zero_measures_returns_empty_even_with_future() -> None:
    handler = CostBenefitHandler()
    result = handler.calculate_cost_benefit(
        hazard_present=object(),
        entity_present=SimpleNamespace(measures=[]),
        hazard_future=object(),
        entity_future=SimpleNamespace(measures=[]),
        future_year=2050,
    )
    assert result == []
