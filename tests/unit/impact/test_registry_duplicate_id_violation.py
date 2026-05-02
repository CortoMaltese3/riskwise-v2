"""ID-uniqueness tests for the impact-function registry.

The registry enforces uniqueness of the ``(haz_type, exp_type, id)``
triple across the merged set so two definitions cannot silently
collide. The ``(exp_type, haz_type)`` lookup pair must also be unique
so the lookup is unambiguous.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.impact.registry import ImpactFunctionRegistryError, load_country_registry


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


def _write(tmp_path: Path, iso3: str, entries: list[dict]) -> None:
    country_dir = tmp_path / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    (country_dir / "impact_functions.json").write_text(json.dumps(entries), encoding="utf-8")


class TestUniqueTriple:
    def test_same_triple_within_one_file_is_rejected(self, tmp_path: Path) -> None:
        _write(tmp_path, "TST", [_entry(), _entry(name="Students copy")])
        with pytest.raises(ImpactFunctionRegistryError, match="Duplicate impact-function id"):
            load_country_registry(["TST"], base_dir=tmp_path)

    def test_same_triple_across_two_country_files_is_rejected(self, tmp_path: Path) -> None:
        # Each country file is internally clean, but they collide once
        # merged. The validator must catch this so a country shipping a
        # duplicate doesn't silently shadow another country's entry.
        _write(tmp_path, "TST", [_entry()])
        _write(tmp_path, "OTH", [_entry(name="Other students")])
        with pytest.raises(ImpactFunctionRegistryError, match="Duplicate impact-function id"):
            load_country_registry(["TST", "OTH"], base_dir=tmp_path)

    def test_same_id_with_different_haz_type_is_allowed(self, tmp_path: Path) -> None:
        # Same exp_type and same id, but different haz_type: triple is
        # unique. This mirrors v1's ``tree_crops_farmers`` which had id=103
        # for both the FL and D variants.
        entries = [
            _entry(haz_type="FL", id=103, exp_type="tree_crops_farmers", name="TC farmers FL"),
            _entry(
                haz_type="D",
                id=103,
                exp_type="tree_crops_farmers",
                name="TC farmers D",
                intensity_unit="SPI",
                intensity=[-3.0, -2.0, -1.0, 0.0],
                mdd=[0.6, 0.3, 0.05, 0.0],
            ),
        ]
        _write(tmp_path, "TST", entries)
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        assert registry.get_spec("tree_crops_farmers", "FL").id == 103
        assert registry.get_spec("tree_crops_farmers", "D").id == 103


class TestUniqueLookupPair:
    def test_two_definitions_for_same_pair_are_rejected(self, tmp_path: Path) -> None:
        # Different ids resolve the (haz_type, exp_type, id) collision but
        # the (exp_type, haz_type) lookup pair would still be ambiguous.
        entries = [
            _entry(id=102, name="Students v1"),
            _entry(id=112, name="Students v2"),
        ]
        _write(tmp_path, "TST", entries)
        expected = (
            r"Multiple impact functions registered for "
            r"\(exp_type='students', haz_type='FL'\)"
        )
        with pytest.raises(ImpactFunctionRegistryError, match=expected):
            load_country_registry(["TST"], base_dir=tmp_path)
