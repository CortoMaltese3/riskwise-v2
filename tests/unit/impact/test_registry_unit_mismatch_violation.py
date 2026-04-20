"""Unit-consistency tests for the impact-function registry.

All entries that share a ``haz_type`` must declare the same
``intensity_unit``. The unit is a property of the hazard, not the
exposure — two flood functions cannot legitimately disagree on whether
the depth axis is in metres or feet, since they will be evaluated
against the same hazard's intensity grid.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from impact.registry import ImpactFunctionRegistryError, load_country_registry


def _entry(**overrides: object) -> dict:
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


class TestUnitConsistency:
    def test_same_unit_for_same_haz_type_is_accepted(self, tmp_path: Path) -> None:
        entries = [
            _entry(),
            _entry(exp_type="roads", id=301, name="Roads"),
        ]
        _write(tmp_path, entries)
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("students", "FL").intensity_unit == "m"
        assert registry.get_spec("roads", "FL").intensity_unit == "m"

    def test_different_haz_types_may_have_different_units(self, tmp_path: Path) -> None:
        entries = [
            _entry(),
            _entry(
                haz_type="D",
                exp_type="water_users",
                id=105,
                name="Water users",
                intensity_unit="SPI",
                intensity=[-3.0, -2.0, -1.0, 0.0],
                mdd=[0.8, 0.4, 0.1, 0.0],
            ),
        ]
        _write(tmp_path, entries)
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("students", "FL").intensity_unit == "m"
        assert registry.get_spec("water_users", "D").intensity_unit == "SPI"

    def test_conflicting_units_for_same_haz_type_are_rejected(self, tmp_path: Path) -> None:
        entries = [
            _entry(),
            _entry(exp_type="roads", id=301, name="Roads", intensity_unit="ft"),
        ]
        _write(tmp_path, entries)
        with pytest.raises(
            ImpactFunctionRegistryError,
            match="Inconsistent intensity_unit for haz_type 'FL'",
        ):
            load_country_registry(["TST"], base_dir=tmp_path)
