"""Custom-data parity scenario (issue #163).

Drives ``RunScenario`` through the ``CustomDataStrategy`` (``isEra=False``)
to stress the loader contract for user-supplied (non-curated) inputs.
The data pointed at here is the same EGY flood pair used by ``test_egy_flood``
— what differs is the *path* through the runner: the custom strategy reads
from ``request_data.entity_filename`` and ``request_data.hazard_filename``
directly rather than via the ERA filename builders.
"""

from __future__ import annotations

from .conftest import ParityRunner, assert_parity_and_record

_SCENARIO = "custom_data_zip"

_PAYLOAD = {
    "countryName": "egypt",
    "hazardType": "flood",
    "scenario": "historical",
    "exposureEconomic": "crops",
    "exposureNonEconomic": "",
    "timeHorizon": [2024, 2024],
    "annualGrowth": 0.0,
    "isEra": False,
    "exposureFile": "entity_TODAY_EGY_FL_crops.xlsx",
    "hazardFile": "hazard_FL_EGY_historical.tif",
    "adaptationMeasures": [],
}


def test_custom_data_zip_parity(parity_runner: ParityRunner) -> None:
    result = parity_runner(_SCENARIO, _PAYLOAD)
    assert_parity_and_record(result)
