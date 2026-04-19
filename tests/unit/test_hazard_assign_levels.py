"""Unit tests for ``HazardHandler.assign_levels``.

The method buckets numeric values from a GeoDataFrame column into ordinal
"level" indices based on a list of per-return-period thresholds. The test
matrix covers both the ascending and descending threshold orderings the UI
uses for hazard vs. impact layers.
"""

from __future__ import annotations

import pandas as pd
import pytest
from hazard.hazard_handler import HazardHandler


@pytest.fixture(scope="module")
def handler() -> HazardHandler:
    return HazardHandler()


class TestAssignLevelsAscending:
    def test_values_are_bucketed_by_ascending_thresholds(self, handler: HazardHandler) -> None:
        df = pd.DataFrame({"rp10": [5, 15, 25, 35, 45]})
        result = handler.assign_levels(df, {"rp10": [10, 20, 30, 40]})
        assert list(result["rp10_level"]) == [1, 1, 2, 3, 4]

    def test_value_at_bucket_boundary_falls_into_upper_bucket(self, handler: HazardHandler) -> None:
        df = pd.DataFrame({"rp10": [20]})
        result = handler.assign_levels(df, {"rp10": [10, 20, 30, 40]})
        assert list(result["rp10_level"]) == [2]

    def test_value_below_first_threshold_pins_to_level_one(self, handler: HazardHandler) -> None:
        df = pd.DataFrame({"rp25": [-100, 0, 9]})
        result = handler.assign_levels(df, {"rp25": [10, 20]})
        assert list(result["rp25_level"]) == [1, 1, 1]

    def test_value_at_or_above_last_threshold_pins_to_max_level(
        self, handler: HazardHandler
    ) -> None:
        df = pd.DataFrame({"rp50": [30, 100, 999]})
        result = handler.assign_levels(df, {"rp50": [10, 20, 30]})
        assert list(result["rp50_level"]) == [3, 3, 3]


class TestAssignLevelsDescending:
    def test_values_are_bucketed_by_descending_thresholds(self, handler: HazardHandler) -> None:
        df = pd.DataFrame({"rp100": [45, 35, 25, 15, 10]})
        result = handler.assign_levels(df, {"rp100": [40, 30, 20, 10]})
        # 45>40 → 1; 40≥35>30 → 1; 30≥25>20 → 2; 20≥15>10 → 3; 10≤10 → 4.
        assert list(result["rp100_level"]) == [1, 1, 2, 3, 4]

    def test_value_at_or_below_last_threshold_pins_to_max_level(
        self, handler: HazardHandler
    ) -> None:
        df = pd.DataFrame({"rp50": [10, 5, -1]})
        result = handler.assign_levels(df, {"rp50": [30, 20, 10]})
        assert list(result["rp50_level"]) == [3, 3, 3]


class TestAssignLevelsMultipleReturnPeriods:
    def test_each_return_period_gets_its_own_level_column(self, handler: HazardHandler) -> None:
        df = pd.DataFrame({"rp10": [5, 25], "rp100": [45, 15]})
        result = handler.assign_levels(df, {"rp10": [10, 20, 30], "rp100": [40, 30, 20, 10]})
        assert list(result["rp10_level"]) == [1, 2]
        assert list(result["rp100_level"]) == [1, 3]
