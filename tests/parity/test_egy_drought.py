"""Egypt drought ERA — present-only parity scenario (issue #163).

Stresses the decreasing-with-intensity SPI curve (engine notebook 08
Scenario 10). Skipped automatically when the EGY drought data pack is
not yet checked in — the scaffolding stays usable as soon as the
``data/entities`` and ``data/hazards`` files land.
"""

from __future__ import annotations

from .conftest import ParityRunner, assert_parity_and_record

_SCENARIO = "egy_drought"

_PAYLOAD = {
    "countryName": "egypt",
    "hazardType": "drought",
    "scenario": "historical",
    "exposureEconomic": "crops",
    "exposureNonEconomic": "",
    "timeHorizon": [2024, 2024],
    "annualGrowth": 0.0,
    "isEra": True,
    "exposureFile": "entity_TODAY_EGY_D_crops.xlsx",
    "hazardFile": "hazard_D_EGY_historical.h5",
    "adaptationMeasures": [],
}


def test_egy_drought_parity(parity_runner: ParityRunner) -> None:
    result = parity_runner(_SCENARIO, _PAYLOAD)
    assert_parity_and_record(result)
