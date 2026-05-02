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
    data: WaterfallPayload
    status: Status
