"""Schema-level tests for the waterfall payload (issue #52).

Verifies the Pydantic model accepts a well-formed payload and rejects
inputs that would let the frontend render a malformed bar chart (wrong
number of categories, missing labels, wrong types).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError


def _valid_categories() -> list[dict]:
    return [
        {"key": "risk_present", "label": "Risk 2024", "value": 100.0, "base": 0.0},
        {
            "key": "economic_development",
            "label": "Economic development",
            "value": 25.0,
            "base": 100.0,
        },
        {
            "key": "climate_change",
            "label": "Climate change",
            "value": 50.0,
            "base": 125.0,
        },
        {"key": "risk_future", "label": "Risk 2050", "value": 175.0, "base": 0.0},
    ]


def _valid_payload() -> dict:
    return {
        "present_year": 2024,
        "future_year": 2050,
        "measurement_unit": "USD",
        "categories": _valid_categories(),
    }


def test_payload_accepts_valid_data() -> None:
    from models.waterfall import WaterfallPayload

    payload = WaterfallPayload(**_valid_payload())
    assert payload.present_year == 2024
    assert payload.future_year == 2050
    assert payload.measurement_unit == "USD"
    assert len(payload.categories) == 4
    assert [c.key for c in payload.categories] == [
        "risk_present",
        "economic_development",
        "climate_change",
        "risk_future",
    ]


def test_payload_rejects_wrong_category_count() -> None:
    from models.waterfall import WaterfallPayload

    bad = _valid_payload()
    bad["categories"] = bad["categories"][:3]
    with pytest.raises(ValidationError):
        WaterfallPayload(**bad)


def test_category_rejects_empty_label() -> None:
    from models.waterfall import WaterfallCategory

    with pytest.raises(ValidationError):
        WaterfallCategory(key="risk_present", label="", value=1.0, base=0.0)


def test_category_rejects_non_numeric_value() -> None:
    from models.waterfall import WaterfallCategory

    with pytest.raises(ValidationError):
        WaterfallCategory(key="risk_present", label="Risk", value="not-a-number", base=0.0)


def test_response_envelopes_payload_with_status() -> None:
    from models.waterfall import WaterfallResponse

    response = WaterfallResponse(
        data=_valid_payload(),
        status={"code": 2000, "message": "ok"},
    )
    assert response.status.code == 2000
    assert response.data.present_year == 2024


def test_payload_defaults_measurement_unit_to_empty() -> None:
    from models.waterfall import WaterfallPayload

    payload_dict = _valid_payload()
    del payload_dict["measurement_unit"]
    payload = WaterfallPayload(**payload_dict)
    assert payload.measurement_unit == ""
