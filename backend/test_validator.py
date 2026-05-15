"""Tests for the editable-IF validator (issue #453)."""

from __future__ import annotations

from backend.impact.validator import FieldError, validate_impact_function_override


def _valid_payload() -> dict:
    return {
        "id": 105,
        "name": "Diarrhoea patients",
        "haz_type": "FL",
        "exp_type": "Diarrhoea patients",
        "intensity_unit": "m",
        "intensity": [0.0, 0.5, 1.0, 2.0],
        "mdd": [0.0, 0.2, 0.5, 1.0],
        "paa": [1.0, 1.0, 1.0, 1.0],
    }


class TestValidateImpactFunctionOverride:
    def test_accepts_a_well_formed_payload(self) -> None:
        assert validate_impact_function_override(_valid_payload()) == []

    def test_rejects_non_dict_payload(self) -> None:
        errors = validate_impact_function_override("not-a-dict")
        assert errors == [FieldError(field="", code="invalid_payload", message=errors[0].message)]

    def test_flags_missing_required_fields(self) -> None:
        payload = _valid_payload()
        del payload["intensity"]
        errors = validate_impact_function_override(payload)
        codes = {(e.field, e.code) for e in errors}
        assert ("intensity", "required") in codes

    def test_flags_non_monotonic_intensity(self) -> None:
        payload = _valid_payload()
        payload["intensity"] = [0.0, 1.0, 0.5, 2.0]
        errors = validate_impact_function_override(payload)
        codes = {(e.field, e.code) for e in errors}
        # The error points at the first decreasing index so the editor can
        # highlight the offending cell directly.
        assert ("intensity[2]", "not_non_decreasing") in codes

    def test_flags_non_monotonic_mdd(self) -> None:
        payload = _valid_payload()
        payload["mdd"] = [0.0, 0.5, 0.2, 0.6]  # oscillates
        errors = validate_impact_function_override(payload)
        assert any(e.field == "mdd" and e.code == "not_monotonic" for e in errors)

    def test_flags_non_numeric_element(self) -> None:
        payload = _valid_payload()
        payload["mdd"] = [0.0, "oops", 0.5, 1.0]
        errors = validate_impact_function_override(payload)
        codes = {(e.field, e.code) for e in errors}
        assert ("mdd[1]", "invalid_type") in codes

    def test_flags_array_length_mismatch(self) -> None:
        payload = _valid_payload()
        payload["paa"] = [1.0, 1.0]  # shorter than intensity/mdd
        errors = validate_impact_function_override(payload)
        codes = {e.code for e in errors}
        assert "length_mismatch" in codes

    def test_accepts_non_increasing_curve(self) -> None:
        # Drought-style: damage decreases with intensity (SPI rises = drier).
        payload = _valid_payload()
        payload["mdd"] = [1.0, 0.7, 0.4, 0.0]
        assert validate_impact_function_override(payload) == []
