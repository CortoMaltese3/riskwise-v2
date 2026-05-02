"""Asserts the impact-function registry hands back engine objects, not CLIMADA ones.

Locks in the Phase 6 Track 3.1 swap (#156): ``ImpactFunctionRegistry.get``
must route through ``backend.engine.adapter.build_impfset`` so the
returned ``ImpactFunc`` belongs to the climate-lama-engine namespace and
its arrays match the registry's input spec exactly.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.impact.registry import load_country_registry


def _write_country(tmp_path: Path, iso3: str, entries: list[dict]) -> None:
    country_dir = tmp_path / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    (country_dir / "impact_functions.json").write_text(json.dumps(entries), encoding="utf-8")


_FLOODED_BUILDINGS_ENTRY: dict = {
    "haz_type": "FL",
    "exp_type": "flooded_buildings",
    "id": 401,
    "name": "Flooded buildings",
    "intensity_unit": "m",
    "intensity": [0.0, 0.5, 1.0, 2.0, 4.0],
    "mdd": [0.0, 0.15, 0.45, 0.85, 1.0],
    "paa": [1.0, 1.0, 1.0, 1.0, 1.0],
}


class TestRegistryReturnsEngineBackedObjects:
    def test_get_returns_engine_impact_func(self, tmp_path: Path) -> None:
        _write_country(tmp_path, "TST", [_FLOODED_BUILDINGS_ENTRY])
        registry = load_country_registry(["TST"], base_dir=tmp_path)

        impf = registry.get("flooded_buildings", "FL")

        # Post-#156 the registry must hand back an engine object, never a
        # ``climada.entity.impact_funcs.ImpactFunc``. Identity by module
        # name is the simplest way to lock that down without importing
        # climate_lama_engine here (forbidden outside backend/engine/).
        assert type(impf).__module__.startswith("climate_lama_engine")

    def test_get_arrays_equal_input_spec_within_tolerance(self, tmp_path: Path) -> None:
        _write_country(tmp_path, "TST", [_FLOODED_BUILDINGS_ENTRY])
        registry = load_country_registry(["TST"], base_dir=tmp_path)

        impf = registry.get("flooded_buildings", "FL")

        tol = 1e-12
        for field in ("intensity", "mdd", "paa"):
            built = list(getattr(impf, field))
            expected = _FLOODED_BUILDINGS_ENTRY[field]
            assert len(built) == len(expected)
            for got, want in zip(built, expected, strict=True):
                assert abs(float(got) - float(want)) < tol, (
                    f"{field}: built={built!r} expected={expected!r}"
                )
