"""Scenario 4 of issue #56: custom impact functions go through the same registry.

A custom drop-in's ``impact_functions.json`` must be validated by the
same :class:`impact.registry.ImpactFunctionRegistry` that governs the
built-ins — so monotonicity, unit consistency, and ID uniqueness checks
apply across the *merged* built-in + custom spec set. These tests wire
the extensibility registry to the impact registry and exercise that
contract.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from extensibility.registry import build_registry
from impact.registry import ImpactFunctionRegistryError, load_registry_from_paths

REPO_COUNTRIES_DIR = Path(__file__).resolve().parents[3] / "countries"


def _write_country_pack(
    user_dir: Path,
    iso3: str,
    impact_functions: list[dict],
    *,
    country_name: str = "Kenya",
) -> None:
    country_dir = user_dir / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    (country_dir / "config.json").write_text(
        json.dumps(
            {
                "config_version": 1,
                "country_code": iso3,
                "country_name": country_name,
                "discount_rate": 0.05,
                "annual_growth_rate": {"crops": 0.02},
                "return_periods": {"FL": [2, 5, 10]},
                "source_references": ["fixture"],
            }
        ),
        encoding="utf-8",
    )
    (country_dir / "impact_functions.json").write_text(
        json.dumps(impact_functions), encoding="utf-8"
    )


def _impf(
    *, haz_type: str, exp_type: str, id_: int, unit: str = "m", name: str | None = None
) -> dict:
    return {
        "haz_type": haz_type,
        "exp_type": exp_type,
        "id": id_,
        "name": name or f"{exp_type}-{haz_type}-{id_}",
        "intensity_unit": unit,
        "intensity": [0.0, 0.5, 1.0, 2.0],
        "mdd": [0.0, 0.2, 0.6, 1.0],
        "paa": [1.0, 1.0, 1.0, 1.0],
    }


class TestMergedRegistryHappyPath:
    def test_custom_impact_function_loads_alongside_builtins(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_country_pack(
            user_countries,
            "KEN",
            [_impf(haz_type="FL", exp_type="schools", id_=999)],
        )

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )
        impact_registry = load_registry_from_paths(registry.impact_function_paths())

        spec = impact_registry.get_spec("schools", "FL")
        assert spec.id == 999
        # Built-in Egypt flood-diarrhea row is still present.
        assert ("diarrhea_patients", "FL") in impact_registry


class TestMergedRegistryRejectsCollisions:
    def test_custom_duplicate_triple_against_builtin_raises(self, tmp_path: Path) -> None:
        """A custom drop-in that reuses a built-in (haz_type, exp_type, id) triple
        is rejected across the merged registry — this is the cross-origin
        invariant Scenario 4 relies on."""
        # Built-in EGY has (FL, diarrhea_patients, 105). A custom pack that
        # defines the same triple under a different country must not slip
        # through by virtue of being in a different file.
        user_countries = tmp_path / "countries"
        _write_country_pack(
            user_countries,
            "KEN",
            [_impf(haz_type="FL", exp_type="diarrhea_patients", id_=105)],
        )

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        with pytest.raises(ImpactFunctionRegistryError) as excinfo:
            load_registry_from_paths(registry.impact_function_paths())
        message = str(excinfo.value)
        # Either the triple-uniqueness or the lookup-pair uniqueness check
        # may catch the clash first; both messages are acceptable so long
        # as the custom drop-in is refused alongside the built-in.
        assert any(
            phrase in message
            for phrase in ("Duplicate impact-function id", "Multiple impact functions registered")
        )
        assert "diarrhea_patients" in message

    def test_non_monotonic_custom_function_is_rejected(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        bad = _impf(haz_type="FL", exp_type="schools", id_=777)
        bad["mdd"] = [0.0, 0.8, 0.2, 1.0]  # not monotonic
        _write_country_pack(user_countries, "KEN", [bad])

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        with pytest.raises(ImpactFunctionRegistryError, match="must be monotonic"):
            load_registry_from_paths(registry.impact_function_paths())
