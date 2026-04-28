"""Thailand flood ERA — present + future parity scenario (issue #163).

Different country than ``test_egy_flood`` so the registry-driven impact
function lookup is exercised against THA-specific entries — confirms the
engine path is country-portable, not just hard-coded for Egypt.
"""

from __future__ import annotations

from .conftest import ParityRunner, assert_parity_and_record

_SCENARIO = "tha_flood"

_PAYLOAD = {
    "countryName": "thailand",
    "hazardType": "flood",
    "scenario": "rcp85",
    "exposureEconomic": "",
    "exposureNonEconomic": "students",
    "timeHorizon": [2024, 2050],
    "annualGrowth": 0.0,
    "isEra": True,
    "exposureFile": "entity_TODAY_THA_FL_students.xlsx",
    "hazardFile": "hazard_FL_THA_rcp85.tif",
    "adaptationMeasures": [],
}


def test_tha_flood_parity(parity_runner: ParityRunner) -> None:
    result = parity_runner(_SCENARIO, _PAYLOAD)
    assert_parity_and_record(result)
