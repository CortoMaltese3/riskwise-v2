"""Happy-path tests for ``backend/impact/registry.py``.

Covers #51 acceptance criteria for the impact-function registry:

* The bundled ``countries/<ISO3>/impact_functions.json`` files load
  cleanly under the production country codes (smoke check that no
  validation rule trips on real data).
* The lookup returns the expected ``ImpactFunctionSpec`` for known
  ``(exp_type, haz_type)`` pairs.
* Repeated lookups for the same triple return the same object — the
  registry caches and never re-builds, which is the contract the
  compute path will rely on once it threads through the registry.
* A missing pair raises ``ImpactFunctionRegistryError`` with the pair
  named in the message.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from impact.registry import (
    ImpactFunctionRegistry,
    ImpactFunctionRegistryError,
    ImpactFunctionSpec,
    load_country_registry,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


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


def _write_country(tmp_path: Path, iso3: str, entries: list[dict] | str) -> Path:
    country_dir = tmp_path / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    path = country_dir / "impact_functions.json"
    if isinstance(entries, str):
        path.write_text(entries, encoding="utf-8")
    else:
        path.write_text(json.dumps(entries), encoding="utf-8")
    return path


class TestBundledRegistry:
    def test_egypt_and_thailand_load_without_error(self) -> None:
        registry = load_country_registry(["EGY", "THA"])
        assert len(registry) > 0
        # Spot-check the lookup wiring on a representative entry.
        spec = registry.get_spec("students", "FL")
        assert spec.intensity_unit == "m"
        assert spec.id == 102
        assert spec.intensity[0] == 0.0
        assert spec.mdd[-1] == 1.0

    def test_thailand_drought_water_users_curve_is_non_increasing(self) -> None:
        registry = load_country_registry(["THA"])
        spec = registry.get_spec("water_users", "D")
        # The drought MDD must shrink as SPI rises (less drought = less damage).
        # If this test fails the registry has loaded a bad curve.
        assert all(b <= a for a, b in zip(spec.mdd, spec.mdd[1:], strict=False))


class TestLookup:
    def test_returns_same_object_for_same_triple_across_calls(self, tmp_path: Path) -> None:
        _write_country(tmp_path, "TST", [_valid_entry()])
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        first = registry.get("students", "FL")
        second = registry.get("students", "FL")
        # Caching: the registry must hand back the very same instance, so
        # downstream code can use identity comparisons / cached impf state.
        assert first is second
        first_spec = registry.get_spec("students", "FL")
        second_spec = registry.get_spec("students", "FL")
        assert first_spec is second_spec

    def test_missing_pair_raises_with_pair_in_message(self, tmp_path: Path) -> None:
        _write_country(tmp_path, "TST", [_valid_entry()])
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        with pytest.raises(ImpactFunctionRegistryError, match="ghosts"):
            registry.get("ghosts", "FL")

    def test_missing_country_file_silently_contributes_no_entries(self, tmp_path: Path) -> None:
        _write_country(tmp_path, "TST", [_valid_entry()])
        # ABS doesn't exist; the loader skips it without raising.
        registry = load_country_registry(["TST", "ABS"], base_dir=tmp_path)
        assert len(registry) == 1


class TestSpecAccess:
    def test_specs_returns_all_entries_in_insertion_order(self, tmp_path: Path) -> None:
        entries = [
            _valid_entry(),
            _valid_entry(exp_type="roads", id=301, name="Roads"),
        ]
        _write_country(tmp_path, "TST", entries)
        registry = load_country_registry(["TST"], base_dir=tmp_path)
        names = [s.name for s in registry.specs()]
        assert names == ["Students", "Roads"]


class TestEmptyConstruction:
    def test_empty_registry_has_no_entries(self) -> None:
        registry = ImpactFunctionRegistry([])
        assert len(registry) == 0
        with pytest.raises(ImpactFunctionRegistryError):
            registry.get("students", "FL")


class TestSpecDataclass:
    def test_spec_is_frozen(self) -> None:
        spec = ImpactFunctionSpec(
            haz_type="FL",
            exp_type="students",
            id=102,
            name="Students",
            intensity_unit="m",
            intensity=(0.0, 1.0),
            mdd=(0.0, 1.0),
            paa=(1.0, 1.0),
        )
        # Frozen dataclass: assignment must raise rather than silently mutate
        # state that the registry's caching depends on.
        with pytest.raises(Exception):  # noqa: B017 - dataclasses raises FrozenInstanceError, but we want to be tolerant
            spec.id = 999  # type: ignore[misc]
