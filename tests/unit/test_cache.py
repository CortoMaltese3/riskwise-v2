"""Unit tests for ``backend.cache`` — LRU eviction and file-keyed hashing."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from cache import LRUCache, file_cache_key


def test_lru_eviction_drops_oldest() -> None:
    cache: LRUCache[int] = LRUCache(maxsize=3)
    for i in range(3):
        cache.put(f"k{i}", i)
    # Touch k0 so k1 becomes the LRU entry.
    assert cache.get("k0") == 0
    cache.put("k3", 3)

    assert "k1" not in cache
    assert cache.get("k0") == 0
    assert cache.get("k2") == 2
    assert cache.get("k3") == 3
    assert len(cache) == 3


def test_lru_maxsize_9_entities_evicts_oldest() -> None:
    # Acceptance criterion: loading 9 distinct entities at maxsize=8 evicts
    # the oldest.
    cache: LRUCache[str] = LRUCache(maxsize=8)
    for i in range(9):
        cache.put(f"entity_{i}", f"payload_{i}")

    assert "entity_0" not in cache
    assert "entity_8" in cache
    assert len(cache) == 8


def test_lru_put_updates_existing() -> None:
    cache: LRUCache[int] = LRUCache(maxsize=2)
    cache.put("a", 1)
    cache.put("a", 2)

    assert cache.get("a") == 2
    assert len(cache) == 1


def test_lru_maxsize_must_be_positive() -> None:
    with pytest.raises(ValueError):
        LRUCache(maxsize=0)


def test_file_cache_key_changes_with_mtime(tmp_path: Path) -> None:
    path = tmp_path / "entity.xlsx"
    path.write_bytes(b"v1")
    key_v1 = file_cache_key(path)

    # Bump mtime; a content edit is irrelevant for the key, only mtime is.
    os.utime(path, (path.stat().st_atime, path.stat().st_mtime + 10))
    key_v2 = file_cache_key(path)

    assert key_v1 != key_v2


def test_file_cache_key_missing_file_is_total(tmp_path: Path) -> None:
    key = file_cache_key(tmp_path / "does-not-exist.xlsx")
    assert isinstance(key, str) and len(key) == 64


def test_clear_empties_cache() -> None:
    cache: LRUCache[int] = LRUCache(maxsize=4)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.clear()

    assert len(cache) == 0
    assert cache.get("a") is None
