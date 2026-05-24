"""``RequestData`` must be constructible without the handler service graph.

Pre-refactor, ``RequestData`` held ``BaseHandler`` and ``HazardHandler``
instances as default-factory fields and used them in ``__post_init__`` to
sanitize country/hazard codes. That coupling made the dataclass impossible
to build in tests without importing CLIMADA and pycountry transitively.

The refactor splits those concerns: ``RequestData`` is a pure dataclass
whose fields are either raw UI values or derivations of them, and the
runner (or the ``RequestData.from_request`` classmethod) is responsible
for the sanitization calls. This test asserts the contract by constructing
a ``RequestData`` directly — no handlers, no side effects.
"""

from __future__ import annotations

from dataclasses import fields
from typing import Any


def _make_request_data(**overrides: Any):
    from backend.scenario.request import RequestData

    defaults: dict[str, Any] = {
        "adaptation_measures": [],
        "annual_growth": 0.02,
        "country_name": "Thailand",
        "country_code": "THA",
        "entity_filename": "",
        "exposure_type": "crops",
        "asset_type": "economic",
        "hazard_filename": "",
        "hazard_type": "flood",
        "hazard_code": "FL",
        "is_era": True,
        "scenario": "rcp45",
        "time_horizon": (2024, 2050),
    }
    defaults.update(overrides)
    return RequestData(**defaults)


class TestRequestDataPlainDataclass:
    def test_constructs_without_handler_fields(self) -> None:
        data = _make_request_data()
        assert data.country_code == "THA"
        assert data.hazard_code == "FL"

    def test_derived_fields_come_from_primary_inputs(self) -> None:
        data = _make_request_data(
            exposure_type="crops",
            asset_type="economic",
            time_horizon=(2020, 2060),
        )
        assert data.exposure_type == "crops"
        assert data.asset_type == "economic"
        assert data.ref_year == 2020
        assert data.future_year == 2060

    def test_non_economic_asset_type_propagates(self) -> None:
        data = _make_request_data(
            exposure_type="students",
            asset_type="non_economic",
        )
        assert data.exposure_type == "students"
        assert data.asset_type == "non_economic"

    def test_dataclass_has_no_handler_fields(self) -> None:
        from backend.scenario.request import RequestData

        field_names = {f.name for f in fields(RequestData)}
        forbidden = {"base_handler", "hazard_handler"}
        assert field_names.isdisjoint(forbidden), (
            f"RequestData must not carry handler fields; found: {field_names & forbidden}"
        )

    def test_from_request_uses_injected_hazard_handler(self, monkeypatch: Any) -> None:
        """``from_request`` takes a hazard handler as an argument and routes
        country sanitization through the ``utils.country`` module functions.

        The test patches the country helpers and provides a stub hazard
        handler; passing means the request sanitization happens via the
        module-level functions and the injected hazard handler.
        """
        from backend.scenario import request as request_module
        from backend.scenario.request import RequestData

        monkeypatch.setattr(
            request_module, "sanitize_country_name", lambda name: f"sanitized::{name}"
        )
        monkeypatch.setattr(request_module, "get_iso3_country_code", lambda _name: "EGY")

        class _HazardStub:
            def get_hazard_code(self, hazard_type: str) -> str:
                assert hazard_type == "drought"
                return "D"

        request = {
            "countryName": "Egypt",
            "hazardType": "drought",
            "exposureType": "crops",
            "assetType": "economic",
            "timeHorizon": [2024, 2050],
            "isEra": True,
            "scenario": "historical",
        }
        data = RequestData.from_request(request, _HazardStub())
        assert data.country_name == "sanitized::Egypt"
        assert data.country_code == "EGY"
        assert data.hazard_code == "D"
        assert data.is_era is True
        assert data.exposure_type == "crops"
        assert data.asset_type == "economic"
