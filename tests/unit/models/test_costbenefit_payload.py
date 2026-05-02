"""Schema-level tests for the cost-benefit payload (issue #53).

Verifies the Pydantic model accepts well-formed payloads and rejects
inputs that would let the frontend render a broken chart (missing
names, wrong types for numeric fields).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError


def _valid_measures() -> list[dict]:
    return [
        {
            "name": "Seawall",
            "cost": 1_000_000.0,
            "benefit": 2_500_000.0,
            "benefit_cost_ratio": 2.5,
        },
        {
            "name": "Mangroves",
            "cost": 400_000.0,
            "benefit": 320_000.0,
            "benefit_cost_ratio": 0.8,
        },
    ]


def _valid_payload() -> dict:
    return {
        "currency_unit": "USD",
        "present_year": 2024,
        "future_year": 2050,
        "measures": _valid_measures(),
    }


def test_payload_accepts_valid_data() -> None:
    from backend.models.costbenefit import CostBenefitPayload

    payload = CostBenefitPayload(**_valid_payload())
    assert payload.currency_unit == "USD"
    assert payload.present_year == 2024
    assert payload.future_year == 2050
    assert [m.name for m in payload.measures] == ["Seawall", "Mangroves"]
    assert payload.measures[0].benefit_cost_ratio == pytest.approx(2.5)


def test_payload_defaults_currency_unit_to_empty() -> None:
    from backend.models.costbenefit import CostBenefitPayload

    raw = _valid_payload()
    del raw["currency_unit"]
    payload = CostBenefitPayload(**raw)
    assert payload.currency_unit == ""


def test_payload_accepts_empty_measures_list() -> None:
    from backend.models.costbenefit import CostBenefitPayload

    raw = _valid_payload()
    raw["measures"] = []
    payload = CostBenefitPayload(**raw)
    assert payload.measures == []


def test_measure_rejects_empty_name() -> None:
    from backend.models.costbenefit import CostBenefitMeasure

    with pytest.raises(ValidationError):
        CostBenefitMeasure(name="", cost=1.0, benefit=2.0, benefit_cost_ratio=2.0)


def test_measure_rejects_non_numeric_cost() -> None:
    from backend.models.costbenefit import CostBenefitMeasure

    with pytest.raises(ValidationError):
        CostBenefitMeasure(
            name="Seawall",
            cost="not-a-number",
            benefit=1.0,
            benefit_cost_ratio=1.0,
        )


def test_response_envelopes_payload_with_status() -> None:
    from backend.models.costbenefit import CostBenefitResponse

    response = CostBenefitResponse(
        data=_valid_payload(),
        status={"code": 2000, "message": "ok"},
    )
    assert response.status.code == 2000
    assert response.data.present_year == 2024
    assert len(response.data.measures) == 2
