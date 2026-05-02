"""Unit tests for ``db.cache_store`` — DuckDB-backed computation cache."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.db import cache_store
from backend.db.connection import DB_PATH_ENV_VAR, get_connection
from backend.db.migrations import run_migrations


@pytest.fixture
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(tmp_path / "cache.db"))
    conn = get_connection()
    try:
        run_migrations(conn)
    finally:
        conn.close()
    yield


def test_derive_cache_key_is_stable() -> None:
    args = dict(
        country="Egypt",
        hazard_type="flood",
        scenario="historical",
        exposure_economic="assets",
        exposure_non_economic="",
        ref_year=2024,
        future_year=2050,
        annual_growth=0.02,
        entity_sha256="a" * 64,
        hazard_sha256="b" * 64,
    )
    k1 = cache_store.derive_cache_key(**args)
    k2 = cache_store.derive_cache_key(**args)
    assert k1 == k2
    assert len(k1) == 64


def test_derive_cache_key_changes_with_inputs() -> None:
    base = dict(
        country="Egypt",
        hazard_type="flood",
        scenario="historical",
        exposure_economic="assets",
        exposure_non_economic="",
        ref_year=2024,
        future_year=2050,
        annual_growth=0.02,
        entity_sha256="a" * 64,
        hazard_sha256="b" * 64,
    )
    other = dict(base)
    other["annual_growth"] = 0.03

    assert cache_store.derive_cache_key(**base) != cache_store.derive_cache_key(**other)


def test_put_then_get_roundtrips_blob(db) -> None:
    cache_store.put("key1", "hazard_geojson", b"payload")
    assert cache_store.get("key1") == b"payload"


def test_get_unknown_key_returns_none(db) -> None:
    assert cache_store.get("nope") is None


def test_put_overwrites_existing(db) -> None:
    cache_store.put("k", "scenario_bundle", b"first")
    cache_store.put("k", "scenario_bundle", b"second")

    assert cache_store.get("k") == b"second"


def test_encode_decode_bundle_roundtrip() -> None:
    bundle = {"hazard_geojson": b"\x00\x01h", "exposure_geojson": b"e"}
    encoded = cache_store.encode_bundle(bundle)

    assert cache_store.decode_bundle(encoded) == bundle


def test_bundle_persisted_through_duckdb(db) -> None:
    bundle = {"hazard_geojson": b"h", "exposure_geojson": b"e"}
    cache_store.put("k", "scenario_bundle", cache_store.encode_bundle(bundle))

    raw = cache_store.get("k")
    assert raw is not None
    assert cache_store.decode_bundle(raw) == bundle


def test_clear_empties_cache(db) -> None:
    cache_store.put("k", "scenario_bundle", b"x")
    cache_store.clear()

    assert cache_store.get("k") is None
