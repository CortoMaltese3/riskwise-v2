"""Adapter test: ``build_measure`` translates legacy ``hazard_freq_cutoff``.

The CLIMADA xlsx convention stored "no frequency cutoff" as a literal
``0.0`` (CLIMADA's ``Measure`` used ``if self.hazard_freq_cutoff:`` so
0 was falsy and skipped the filter). The engine's ``Measure.freq_cutoff``
is ``None`` for "no cutoff" and applies the filter for any concrete
value — passing the xlsx ``0.0`` through unchanged removes every event
with frequency > 0 (i.e., the entire hazard set) and crashes
``ImpactCalc`` on integer division by zero events. ``build_measure``
must translate ``0`` (and any non-positive value) to ``None``.
"""

from __future__ import annotations

import pytest

pytest.importorskip("climate_lama_engine")

from backend.engine.adapter import build_measure  # noqa: E402
from backend.engine.types import MeasureSpec  # noqa: E402


def _spec(freq: float | None) -> MeasureSpec:
    return MeasureSpec(
        name="m",
        haz_type="FL",
        cost=1.0,
        hazard_freq_cutoff=freq,
    )


@pytest.mark.parametrize("legacy_zero", [0.0, 0, -0.0])
def test_freq_cutoff_zero_translates_to_none(legacy_zero) -> None:
    """Reproduces the EGY flood crash: every measure has freq_cutoff=0.0
    in the seeded xlsx, which the engine reads as 'remove all events'."""
    measure = build_measure(_spec(legacy_zero))
    assert measure.freq_cutoff is None


def test_freq_cutoff_none_passes_through() -> None:
    measure = build_measure(_spec(None))
    assert measure.freq_cutoff is None


def test_positive_freq_cutoff_preserved() -> None:
    measure = build_measure(_spec(0.1))
    assert measure.freq_cutoff == 0.1
