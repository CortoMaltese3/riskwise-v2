"""Tests verifying cost-benefit handler reads measures from DuckDB, not xlsx."""

from __future__ import annotations

from costben.costben_handler import CostBenefitHandler


def test_get_measure_names_returns_names_for_hazard(migrated_conn, tmp_path) -> None:
    from measures.measures_seeder import seed_builtin_measures

    from tests.unit.measures.conftest import write_minimal_measures_xlsx

    xlsx = tmp_path / "measures.xlsx"
    write_minimal_measures_xlsx(xlsx)
    seed_builtin_measures(migrated_conn, xlsx)

    handler = CostBenefitHandler()
    names = handler.get_measure_names_from_db(migrated_conn, "HW")
    assert isinstance(names, list)
    assert len(names) == 2
    assert all(isinstance(n, str) for n in names)


def test_get_measure_names_flood(migrated_conn, tmp_path) -> None:
    from measures.measures_seeder import seed_builtin_measures

    from tests.unit.measures.conftest import write_minimal_measures_xlsx

    xlsx = tmp_path / "measures.xlsx"
    write_minimal_measures_xlsx(xlsx)
    seed_builtin_measures(migrated_conn, xlsx)

    handler = CostBenefitHandler()
    names = handler.get_measure_names_from_db(migrated_conn, "FL")
    assert len(names) == 1
    assert "retention_reservoirs" in names


def test_get_measure_names_unknown_hazard_returns_empty(migrated_conn, tmp_path) -> None:
    from measures.measures_seeder import seed_builtin_measures

    from tests.unit.measures.conftest import write_minimal_measures_xlsx

    xlsx = tmp_path / "measures.xlsx"
    write_minimal_measures_xlsx(xlsx)
    seed_builtin_measures(migrated_conn, xlsx)

    handler = CostBenefitHandler()
    names = handler.get_measure_names_from_db(migrated_conn, "TC")
    assert names == []


def test_get_measure_names_with_explicit_set_id(migrated_conn, tmp_path) -> None:
    from measures.measures_seeder import seed_builtin_measures

    from tests.unit.measures.conftest import write_minimal_measures_xlsx

    xlsx = tmp_path / "measures.xlsx"
    write_minimal_measures_xlsx(xlsx)
    seed_builtin_measures(migrated_conn, xlsx)

    set_id = migrated_conn.execute(
        "SELECT id FROM measure_sets WHERE is_builtin = TRUE"
    ).fetchone()[0]

    handler = CostBenefitHandler()
    names = handler.get_measure_names_from_db(migrated_conn, "HW", measure_set_id=set_id)
    assert len(names) == 2


def test_get_measure_names_handler_has_no_xlsx_method() -> None:
    handler = CostBenefitHandler()
    assert not hasattr(handler, "get_measure_set_from_excel"), (
        "get_measure_set_from_excel should be removed; handler must read from DB"
    )
