"""Waterfall risk-chart payload model.

Each ``WaterfallCategory`` is one bar; ``base`` is the bottom of the
bar so the two middle deltas (economic development, climate change)
stack correctly between the present-day and future-year totals.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from backend.models.common import Status


class WaterfallCategory(BaseModel):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    value: float
    base: float


class WaterfallPayload(BaseModel):
    present_year: int
    future_year: int
    measurement_unit: str = ""
    categories: list[WaterfallCategory] = Field(min_length=4, max_length=4)


class WaterfallResponse(BaseModel):
    # ``data`` is optional because the API is polled at app start (before any
    # scenario has run) and on stale-state reloads. Returning ``None`` lets the
    # handler signal "no waterfall yet" via the status code without tripping
    # ``WaterfallPayload``'s ``categories`` length invariant — which would
    # otherwise raise ``ResponseValidationError`` and surface as a 500 to the
    # renderer (white-chart-on-startup regression).
    data: WaterfallPayload | None = None
    status: Status
