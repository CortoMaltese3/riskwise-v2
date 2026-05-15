"""Tests for the engine-code → catalog-name join driving #429.

The engine echoes ``measure_name`` verbatim from the entity xlsx, which
ships opaque short codes ("GR", "TP", "GBC"). The catalog rows carry an
i18n key like ``adaptation_measures_green_roofs``. ``compute_cost_benefit_data``
joins one to the other so the chart can render translated full names.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest

from backend.costben.costben_handler import CostBenefitHandler
from backend.db.migrations import run_migrations
from backend.engine.types import CostBenefitResult, EntityBundle, ExposureArrays
from backend.measures.measures_seeder import seed_builtin_measures


@pytest.fixture
def migrated_conn(tmp_path: Path):
    conn = duckdb.connect(str(tmp_path / "test.db"))
    run_migrations(conn)
    try:
        yield conn
    finally:
        conn.close()


def _write_measures_json_with_codes(path: Path) -> None:
    """Write a minimal measures JSON that includes a ``code`` column.

    Covers the three ERA codes the #429 acceptance criteria require — GR,
    TP, GBC — plus a flood row with no code so the no-mapping fallback
    path is exercised.
    """
    rows = [
        {
            "name": "adaptation_measures_green_roofs",
            "cost": 1,
            "MDD impact a": 0.69,
            "peril_ID": "HW",
            "code": "GR",
        },
        {
            "name": "adaptation_measures_trees_planting",
            "cost": 1,
            "MDD impact a": 0.675,
            "peril_ID": "HW",
            "code": "TP",
        },
        {
            "name": "adaptation_measures_green_building_codes",
            "cost": 1,
            "MDD impact a": 0.8,
            "peril_ID": "HW",
            "code": "GBC",
        },
        {
            "name": "adaptation_measures_wetland_restoration_and_rehabilitation",
            "cost": 1,
            "MDD impact a": 0.85,
            "peril_ID": "FL",
            "code": None,
        },
    ]
    path.write_text(json.dumps(rows), encoding="utf-8")


@pytest.fixture
def seeded_with_codes(migrated_conn, tmp_path: Path):
    src = tmp_path / "measures_with_codes.json"
    _write_measures_json_with_codes(src)
    seed_builtin_measures(migrated_conn, src)
    return migrated_conn


def _entity_present_stub(ref_year: int = 2024) -> EntityBundle:
    return EntityBundle(
        exposures=ExposureArrays(values=(), centroid_idx=(), impf_id=(), value_unit="USD"),
        ref_year=ref_year,
    )


def test_build_display_name_lookup_returns_code_to_name_map(seeded_with_codes) -> None:
    handler = CostBenefitHandler()
    lookup = handler.build_display_name_lookup(seeded_with_codes)
    assert lookup.get("GR") == "adaptation_measures_green_roofs"
    assert lookup.get("TP") == "adaptation_measures_trees_planting"
    assert lookup.get("GBC") == "adaptation_measures_green_building_codes"


def test_lookup_excludes_rows_with_blank_code(seeded_with_codes) -> None:
    handler = CostBenefitHandler()
    lookup = handler.build_display_name_lookup(seeded_with_codes)
    # The wetland row was seeded with an empty code and must not appear.
    assert all("wetland_restoration" not in v for v in lookup.values())


def test_source_with_only_null_codes_yields_empty_lookup(migrated_conn, tmp_path: Path) -> None:
    # Catalog rows can legitimately ship without a code (custom uploads
    # with no engine alias); the lookup should still be safe to call.
    src = tmp_path / "measures.json"
    src.write_text(
        json.dumps(
            [
                {
                    "name": "no_code_measure",
                    "cost": 1,
                    "MDD impact a": 0.5,
                    "peril_ID": "HW",
                    "code": None,
                }
            ]
        ),
        encoding="utf-8",
    )
    seed_builtin_measures(migrated_conn, src)
    handler = CostBenefitHandler()
    assert handler.build_display_name_lookup(migrated_conn) == {}


def _result(name: str) -> CostBenefitResult:
    return CostBenefitResult(
        name=name,
        cost=1.0,
        benefit=2.0,
        bcr=2.0,
        risk_baseline_present=0.0,
        risk_baseline_future=0.0,
    )


def test_compute_cost_benefit_data_populates_display_name(
    seeded_with_codes, tmp_path, monkeypatch
) -> None:
    # Redirect the temp-file write so the test does not touch the user-data
    # directory.
    from backend import costben

    monkeypatch.setattr(costben.costben_handler, "DATA_TEMP_DIR", tmp_path)

    handler = CostBenefitHandler()
    lookup = handler.build_display_name_lookup(seeded_with_codes)
    results = [_result("GR"), _result("TP"), _result("GBC")]
    payload = handler.compute_cost_benefit_data(
        results,
        _entity_present_stub(),
        future_year=2050,
        display_name_lookup=lookup,
    )
    measures = payload["measures"]
    assert measures[0]["name"] == "GR"
    assert measures[0]["display_name"] == "adaptation_measures_green_roofs"
    assert measures[1]["display_name"] == "adaptation_measures_trees_planting"
    assert measures[2]["display_name"] == "adaptation_measures_green_building_codes"


def test_compute_cost_benefit_data_omits_display_name_when_no_match(tmp_path, monkeypatch) -> None:
    from backend import costben

    monkeypatch.setattr(costben.costben_handler, "DATA_TEMP_DIR", tmp_path)

    handler = CostBenefitHandler()
    results = [_result("UNKNOWN_CODE")]
    payload = handler.compute_cost_benefit_data(
        results,
        _entity_present_stub(),
        future_year=2050,
        display_name_lookup={"GR": "adaptation_measures_green_roofs"},
    )
    assert payload["measures"][0]["name"] == "UNKNOWN_CODE"
    assert "display_name" not in payload["measures"][0]


def test_compute_cost_benefit_data_without_lookup_omits_display_name(tmp_path, monkeypatch) -> None:
    from backend import costben

    monkeypatch.setattr(costben.costben_handler, "DATA_TEMP_DIR", tmp_path)

    handler = CostBenefitHandler()
    results = [_result("GR")]
    payload = handler.compute_cost_benefit_data(
        results,
        _entity_present_stub(),
        future_year=2050,
    )
    assert "display_name" not in payload["measures"][0]
