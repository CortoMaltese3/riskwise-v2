"""Egypt flood ERA — present + future parity scenario (issue #163).

Phase 4 baseline: full ERA flood run with `rcp85` future hazard, exercising
the cost-benefit measure path. The CLIMADA snapshot is the legacy witness;
the engine snapshot becomes the authoritative reference once #T4.2 flips
the default backend.
"""

from __future__ import annotations

from .conftest import ParityRunner, assert_parity_and_record

_SCENARIO = "egy_flood"

_PAYLOAD = {
    "countryName": "egypt",
    "hazardType": "flood",
    "scenario": "rcp85",
    "exposureEconomic": "crops",
    "exposureNonEconomic": "",
    "timeHorizon": [2024, 2050],
    "annualGrowth": 0.0,
    "isEra": True,
    "exposureFile": "entity_TODAY_EGY_FL_crops.xlsx",
    "hazardFile": "hazard_FL_EGY_rcp85.tif",
    "adaptationMeasures": [],
}


def test_egy_flood_parity(parity_runner: ParityRunner) -> None:
    result = parity_runner(_SCENARIO, _PAYLOAD)
    assert_parity_and_record(result)
