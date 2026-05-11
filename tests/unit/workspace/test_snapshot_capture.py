"""Unit tests for the user-driven snapshot capture flow (#303)."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from backend.db import (
    DB_PATH_ENV_VAR,
    MIGRATIONS_DIR,
    ScenarioNotFound,
    create_snapshot,
    delete_snapshot,
    get_scenario,
    get_snapshot_image,
    insert_scenario,
    list_scenarios,
    list_snapshots,
    run_migrations,
    update_snapshot,
)


@pytest.fixture
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "workspace.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(db_path))
    conn = duckdb.connect(str(db_path))
    try:
        run_migrations(conn, migrations_dir=MIGRATIONS_DIR)
    finally:
        conn.close()
    return db_path


def _provenance() -> dict:
    return {
        "app_version": "2.0.0-dev",
        "engine_version": "2.0.0-dev",
        "climada_version": "4.1.1",
        "entity_data_sha256": "a" * 64,
        "hazard_data_sha256": "b" * 64,
        "country_config_sha256": "c" * 64,
        "config_version": "1",
        "random_seed": 42,
    }


def _params() -> dict:
    return {
        "country": "Egypt",
        "hazard_type": "flood",
        "scenario": "rcp85",
        "exposure_type": "crops",
        "asset_type": "economic",
        "ref_year": 2024,
        "future_year": 2050,
        "annual_growth": 2.0,
        "is_era": True,
        "app_option": "era",
    }


_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _seed_unsaved_scenario(scenario_id: str = "s-cap") -> None:
    insert_scenario(
        scenario_id,
        _params(),
        results={"impact_summary": b"{}"},
        provenance=_provenance(),
    )


def test_create_snapshot_inserts_row_and_promotes_saved(tmp_db: Path) -> None:
    _seed_unsaved_scenario()
    # Sanity: parent starts unsaved so it would be hidden from the list.
    assert list_scenarios() == []

    row = create_snapshot(
        scenario_id="s-cap",
        snapshot_type="map",
        image=_PNG_BYTES,
        caption="zoomed cairo",
    )

    assert row.scenario_id == "s-cap"
    assert row.snapshot_type == "map"
    assert row.caption == "zoomed cairo"
    assert row.created_at is not None

    # Save promotion: the parent must now appear in the workspace listing.
    listed = list_scenarios()
    assert len(listed) == 1
    assert listed[0].id == "s-cap"
    assert listed[0].saved is True

    detail = get_scenario("s-cap")
    assert detail is not None
    assert detail.scenario.saved is True


def test_create_snapshot_unknown_scenario_raises_and_inserts_nothing(tmp_db: Path) -> None:
    with pytest.raises(ScenarioNotFound):
        create_snapshot(
            scenario_id="missing",
            snapshot_type="map",
            image=_PNG_BYTES,
        )
    assert list_snapshots("missing") == []


def test_get_snapshot_image_returns_bytes_and_mime(tmp_db: Path) -> None:
    _seed_unsaved_scenario()
    row = create_snapshot(scenario_id="s-cap", snapshot_type="waterfall", image=_PNG_BYTES)

    result = get_snapshot_image(row.id)
    assert result is not None
    image_bytes, mime = result
    assert image_bytes == _PNG_BYTES
    assert mime == "image/png"


def test_get_snapshot_image_returns_none_for_unknown_id(tmp_db: Path) -> None:
    assert get_snapshot_image("does-not-exist") is None


def test_update_snapshot_caption_round_trips(tmp_db: Path) -> None:
    _seed_unsaved_scenario()
    row = create_snapshot(scenario_id="s-cap", snapshot_type="map", image=_PNG_BYTES)
    assert row.caption is None

    updated = update_snapshot(row.id, caption="Cairo, June 2050")
    assert updated is not None
    assert updated.caption == "Cairo, June 2050"

    listed = list_snapshots("s-cap")
    assert listed[0].caption == "Cairo, June 2050"

    cleared = update_snapshot(row.id, caption=None)
    assert cleared is not None
    assert cleared.caption is None


def test_update_snapshot_caption_unknown_id_returns_none(tmp_db: Path) -> None:
    assert update_snapshot("nope", caption="x") is None


def test_create_snapshot_persists_title_or_null(tmp_db: Path) -> None:
    # #350: ``title`` is independent from caption; an omitted title round-trips
    # as NULL while a supplied title persists verbatim.
    _seed_unsaved_scenario()
    without_title = create_snapshot(scenario_id="s-cap", snapshot_type="map", image=_PNG_BYTES)
    assert without_title.title is None
    with_title = create_snapshot(
        scenario_id="s-cap",
        snapshot_type="waterfall",
        image=_PNG_BYTES,
        title="Figure 1: Annual loss",
        caption="Egypt, 2050 baseline",
    )
    assert with_title.title == "Figure 1: Annual loss"
    assert with_title.caption == "Egypt, 2050 baseline"

    # ``list_snapshots`` surfaces the new column so the drawer can render it.
    listed = list_snapshots("s-cap")
    titles = {snap.id: snap.title for snap in listed}
    assert titles[without_title.id] is None
    assert titles[with_title.id] == "Figure 1: Annual loss"


def test_update_snapshot_partial_fields_are_independent(tmp_db: Path) -> None:
    # PATCH semantics: each field is touched only when explicitly passed.
    # Omitting a kwarg must leave the existing column value alone — required
    # so the drawer's title-only and caption-only blurs don't clobber each
    # other.
    _seed_unsaved_scenario()
    row = create_snapshot(
        scenario_id="s-cap",
        snapshot_type="map",
        image=_PNG_BYTES,
        title="initial title",
        caption="initial caption",
    )

    only_title = update_snapshot(row.id, title="new title")
    assert only_title is not None
    assert only_title.title == "new title"
    assert only_title.caption == "initial caption"

    only_caption = update_snapshot(row.id, caption="new caption")
    assert only_caption is not None
    assert only_caption.title == "new title"
    assert only_caption.caption == "new caption"

    both = update_snapshot(row.id, title="t2", caption="c2")
    assert both is not None
    assert both.title == "t2"
    assert both.caption == "c2"

    # Explicit None clears just the targeted column.
    cleared_title = update_snapshot(row.id, title=None)
    assert cleared_title is not None
    assert cleared_title.title is None
    assert cleared_title.caption == "c2"


def test_list_snapshots_includes_caption(tmp_db: Path) -> None:
    _seed_unsaved_scenario()
    create_snapshot(
        scenario_id="s-cap",
        snapshot_type="cost_benefit",
        image=_PNG_BYTES,
        caption="initial",
    )
    listed = list_snapshots("s-cap")
    assert len(listed) == 1
    assert listed[0].caption == "initial"
    assert listed[0].snapshot_type == "cost_benefit"


def test_delete_snapshot_then_get_image_returns_none(tmp_db: Path) -> None:
    _seed_unsaved_scenario()
    row = create_snapshot(scenario_id="s-cap", snapshot_type="map", image=_PNG_BYTES)
    assert delete_snapshot(row.id) is True
    assert get_snapshot_image(row.id) is None
