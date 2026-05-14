"""Integration tests for ``CostBenefitHandler.get_measures_from_db``.

These tests target the catalog dedupe behaviour (issue #446). They seed
known-duplicate fixtures into a temporary DuckDB so the assertions don't
depend on a developer's local production DB.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from backend.costben.costben_handler import CostBenefitHandler
from backend.db.migrations import run_migrations


@pytest.fixture
def db_conn(tmp_path: Path) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(str(tmp_path / "riskwise.db"))
    run_migrations(conn)
    yield conn
    conn.close()


def _insert_set(
    conn: duckdb.DuckDBPyConnection,
    set_id: str,
    name: str,
    is_builtin: bool,
    uploaded_at: str,
) -> None:
    conn.execute(
        "INSERT INTO measure_sets (id, name, uploaded_at, is_builtin, sha256) "
        "VALUES (?, ?, ?, ?, ?)",
        [set_id, name, uploaded_at, is_builtin, f"sha-{set_id}"],
    )


def _insert_measure(
    conn: duckdb.DuckDBPyConnection,
    measure_id: str,
    set_id: str,
    name: str,
    hazard_type: str = "flood",
    cost_factor: float = 1_000.0,
    description: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO adaptation_measures
            (id, measure_set_id, country, hazard_type, exposure_type,
             name, cost_factor, hazard_reduction_percentage,
             description, source_reference, is_builtin)
        VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'test', FALSE)
        """,
        [measure_id, set_id, hazard_type, name, cost_factor, 10.0, description],
    )


class TestGetMeasuresDedupe:
    """Each measure name appears at most once per response (issue #446)."""

    def test_intra_set_duplicate_names_collapse(self, db_conn: duckdb.DuckDBPyConnection) -> None:
        """The source xlsx may legitimately ship two rows with the same
        ``name`` and different ``cost_factor``. The catalog response keeps
        exactly one — the most recently created row wins as a deterministic
        tiebreaker.
        """
        _insert_set(db_conn, "set-A", "Built-in v1", is_builtin=True, uploaded_at="2025-01-01")
        _insert_measure(db_conn, "m-1", "set-A", "early_warning", cost_factor=1.0)
        _insert_measure(db_conn, "m-2", "set-A", "early_warning", cost_factor=2.0)

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL")

        names = [r["name"] for r in rows]
        assert names == ["early_warning"]
        assert rows[0]["measure_set_name"] == "Built-in v1"
        assert rows[0]["is_builtin"] is True

    def test_two_builtin_sets_collapse_to_most_recent(
        self, db_conn: duckdb.DuckDBPyConnection
    ) -> None:
        """When the seeder has re-run on a content-changed xlsx, two
        built-in ``measure_sets`` end up in the DB. The catalog response
        keeps the most-recently uploaded one — that matches the user's
        current view of the data.
        """
        _insert_set(db_conn, "old", "Built-in v2024", is_builtin=True, uploaded_at="2024-06-01")
        _insert_set(db_conn, "new", "Built-in v2024", is_builtin=True, uploaded_at="2025-04-01")
        _insert_measure(db_conn, "old-1", "old", "trees_planting", cost_factor=10.0)
        _insert_measure(db_conn, "new-1", "new", "trees_planting", cost_factor=20.0)

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL")

        assert [r["name"] for r in rows] == ["trees_planting"]
        assert rows[0]["measure_set_id"] == "new"
        assert rows[0]["cost_factor"] == 20.0

    def test_builtin_wins_over_custom_for_same_name(
        self, db_conn: duckdb.DuckDBPyConnection
    ) -> None:
        """Cross-set duplicates collapse with built-in preferred, so the
        scenario pipeline keeps using the canonical reduction percentage
        instead of a user-edited override."""
        _insert_set(db_conn, "built", "Built-in", is_builtin=True, uploaded_at="2025-01-01")
        _insert_set(db_conn, "user", "Custom", is_builtin=False, uploaded_at="2025-12-01")
        _insert_measure(db_conn, "b-1", "built", "early_warning", description="canonical")
        _insert_measure(db_conn, "u-1", "user", "early_warning", description="overridden")

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL")

        assert len(rows) == 1
        assert rows[0]["is_builtin"] is True
        assert rows[0]["description"] == "canonical"

    def test_distinct_names_preserved_across_sets(self, db_conn: duckdb.DuckDBPyConnection) -> None:
        """Custom measures with unique names must still surface — dedupe
        only collapses name collisions, not cross-set merging itself."""
        _insert_set(db_conn, "built", "Built-in", is_builtin=True, uploaded_at="2025-01-01")
        _insert_set(db_conn, "user", "Custom", is_builtin=False, uploaded_at="2025-06-01")
        _insert_measure(db_conn, "b-1", "built", "trees_planting")
        _insert_measure(db_conn, "u-1", "user", "rooftop_garden")

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL")

        names_by_set = {r["name"]: r["measure_set_id"] for r in rows}
        assert names_by_set == {"trees_planting": "built", "rooftop_garden": "user"}

    def test_measure_set_id_filter_still_dedupes(self, db_conn: duckdb.DuckDBPyConnection) -> None:
        """Scoping to a specific set must still collapse intra-set
        duplicates: the same xlsx variants that produce repeats in the
        merged view also produce repeats inside a single set."""
        _insert_set(db_conn, "set-A", "Built-in", is_builtin=True, uploaded_at="2025-01-01")
        _insert_set(db_conn, "set-B", "Custom", is_builtin=False, uploaded_at="2025-06-01")
        _insert_measure(db_conn, "a-1", "set-A", "early_warning", cost_factor=1.0)
        _insert_measure(db_conn, "a-2", "set-A", "early_warning", cost_factor=2.0)
        _insert_measure(db_conn, "b-1", "set-B", "early_warning")

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL", measure_set_id="set-A")

        assert len(rows) == 1
        assert rows[0]["measure_set_id"] == "set-A"

    def test_country_filter_unchanged_by_dedupe(self, db_conn: duckdb.DuckDBPyConnection) -> None:
        """Country-scoped measures coexisting with set-wide rows should
        still surface; dedupe operates on ``name`` alone."""
        _insert_set(db_conn, "built", "Built-in", is_builtin=True, uploaded_at="2025-01-01")
        # set-wide row (country NULL) and country-specific row with a
        # different name — both should appear when filtered by Egypt.
        _insert_measure(db_conn, "m-wide", "built", "trees_planting")
        db_conn.execute(
            """
            INSERT INTO adaptation_measures
                (id, measure_set_id, country, hazard_type, exposure_type,
                 name, cost_factor, hazard_reduction_percentage,
                 description, source_reference, is_builtin)
            VALUES ('m-eg', 'built', 'Egypt', 'flood', NULL,
                    'nile_levee', 100.0, 25.0, NULL, 'test', TRUE)
            """
        )

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL", country_name="Egypt")

        names = sorted(r["name"] for r in rows)
        assert names == ["nile_levee", "trees_planting"]

    def test_other_hazard_excluded(self, db_conn: duckdb.DuckDBPyConnection) -> None:
        """The hazard filter is applied before dedupe; mismatched rows
        must not leak through and must not displace a legitimate name
        from the response."""
        _insert_set(db_conn, "built", "Built-in", is_builtin=True, uploaded_at="2025-01-01")
        _insert_measure(db_conn, "m-fl", "built", "early_warning", hazard_type="flood")
        _insert_measure(db_conn, "m-hw", "built", "early_warning", hazard_type="heatwaves")

        rows = CostBenefitHandler().get_measures_from_db(db_conn, "FL")

        assert [r["hazard_type"] for r in rows] == ["flood"]
