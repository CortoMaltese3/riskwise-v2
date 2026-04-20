"""Monotonicity validation tests for the impact-function registry.

The registry must reject MDD/PAA arrays that oscillate with intensity,
and intensity arrays that are not strictly non-decreasing. The check is
direction-agnostic for MDD/PAA (drought damage falls as SPI rises, flood
damage grows as depth rises — both shapes are valid), so we cover the
"goes up then down" / "goes down then up" cases as well as the simpler
single-direction acceptance.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from impact.registry import ImpactFunctionRegistryError, load_country_registry


def _valid_entry(**overrides: object) -> dict:
    base: dict = {
        "haz_type": "FL",
        "exp_type": "students",
        "id": 102,
        "name": "Students",
        "intensity_unit": "m",
        "intensity": [0.0, 0.5, 1.0, 2.0],
        "mdd": [0.0, 0.2, 0.6, 1.0],
        "paa": [1.0, 1.0, 1.0, 1.0],
    }
    base.update(overrides)
    return base


def _write(tmp_path: Path, entries: list[dict]) -> None:
    country_dir = tmp_path / "TST"
    country_dir.mkdir(parents=True, exist_ok=True)
    (country_dir / "impact_functions.json").write_text(json.dumps(entries), encoding="utf-8")


class TestMonotonicityAccepts:
    def test_non_decreasing_mdd_is_accepted(self, tmp_path: Path) -> None:
        _write(tmp_path, [_valid_entry(mdd=[0.0, 0.1, 0.5, 1.0])])
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("students", "FL").mdd == (0.0, 0.1, 0.5, 1.0)

    def test_non_increasing_mdd_is_accepted(self, tmp_path: Path) -> None:
        # Drought-style: damage falls as SPI rises.
        _write(
            tmp_path,
            [
                _valid_entry(
                    haz_type="D",
                    intensity_unit="SPI",
                    intensity=[-3.0, -2.0, -1.0, 0.0],
                    mdd=[0.8, 0.4, 0.1, 0.0],
                )
            ],
        )
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("students", "D").mdd == (0.8, 0.4, 0.1, 0.0)

    def test_constant_mdd_is_accepted(self, tmp_path: Path) -> None:
        # A flat curve is both non-decreasing and non-increasing.
        _write(tmp_path, [_valid_entry(mdd=[0.5, 0.5, 0.5, 0.5])])
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("students", "FL").mdd == (0.5, 0.5, 0.5, 0.5)


class TestMonotonicityRejects:
    def test_mdd_that_goes_up_then_down_is_rejected(self, tmp_path: Path) -> None:
        _write(tmp_path, [_valid_entry(mdd=[0.0, 0.5, 0.8, 0.3])])
        with pytest.raises(ImpactFunctionRegistryError, match="'mdd' must be monotonic"):
            load_country_registry(["TST"], base_dir=tmp_path)

    def test_mdd_that_dips_negative_then_recovers_is_rejected(self, tmp_path: Path) -> None:
        # This is the v1 ``tree_crops_farmers/flood`` shape that motivated
        # the validator: an early dip below zero followed by recovery, which
        # silently produced negative damage in the compute path.
        _write(
            tmp_path,
            [
                _valid_entry(
                    mdd=[0.0, -0.0061, -0.003, 0.0082],
                    intensity=[0.0, 0.25, 0.5, 0.75],
                )
            ],
        )
        with pytest.raises(ImpactFunctionRegistryError, match="'mdd' must be monotonic"):
            load_country_registry(["TST"], base_dir=tmp_path)

    def test_paa_that_oscillates_is_rejected(self, tmp_path: Path) -> None:
        _write(tmp_path, [_valid_entry(paa=[1.0, 0.5, 1.0, 0.5])])
        with pytest.raises(ImpactFunctionRegistryError, match="'paa' must be monotonic"):
            load_country_registry(["TST"], base_dir=tmp_path)

    def test_intensity_that_decreases_is_rejected(self, tmp_path: Path) -> None:
        # Intensity must always be sorted ascending — this is required so
        # MDD/PAA monotonicity has a stable axis to be measured against.
        _write(tmp_path, [_valid_entry(intensity=[0.0, 1.0, 0.5, 2.0])])
        with pytest.raises(ImpactFunctionRegistryError, match="'intensity' must be non-decreasing"):
            load_country_registry(["TST"], base_dir=tmp_path)
