"""Cost-benefit chart payload model.

Each ``CostBenefitMeasure`` is one bar; ``benefit_cost_ratio``
(benefit/cost, inverted from CLIMADA's ``cost_ben_ratio``) is the
value the chart ranks measures by.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from backend.models.common import Status


class CostBenefitMeasure(BaseModel):
    name: str = Field(min_length=1)
    cost: float
    benefit: float
    benefit_cost_ratio: float
    # Optional i18n key for the human-readable measure name. When set the
    # frontend renders the translated full name on the chart axis instead
    # of the raw engine code in ``name`` (#429).
    display_name: str | None = None


class CostBenefitPayload(BaseModel):
    currency_unit: str = ""
    present_year: int
    future_year: int
    measures: list[CostBenefitMeasure] = Field(default_factory=list)


class CostBenefitResponse(BaseModel):
    data: CostBenefitPayload
    status: Status
