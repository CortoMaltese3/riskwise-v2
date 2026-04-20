"""Thread-safe LRU cache for loaded CLIMADA Entity/Hazard objects.

Re-running the same scenario twice used to reload the backing ``.xlsx``
and ``.h5`` files from disk on every pass. This module caches the
loaded objects keyed by ``(absolute path, mtime_ns)`` hashed to SHA-256
so an edit invalidates the entry automatically.

The default capacity is 8 and can be overridden with the
``RISKWISE_CACHE_SIZE`` environment variable.
"""

from __future__ import annotations

import hashlib
import os
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Generic, TypeVar

_T = TypeVar("_T")

_DEFAULT_MAX_SIZE = 8
_ENV_SIZE = "RISKWISE_CACHE_SIZE"


def _resolve_maxsize() -> int:
    raw = os.environ.get(_ENV_SIZE)
    if not raw:
        return _DEFAULT_MAX_SIZE
    try:
        value = int(raw)
    except ValueError:
        return _DEFAULT_MAX_SIZE
    return value if value > 0 else _DEFAULT_MAX_SIZE


class LRUCache(Generic[_T]):
    """Bounded, thread-safe least-recently-used cache."""

    def __init__(self, maxsize: int = _DEFAULT_MAX_SIZE) -> None:
        if maxsize <= 0:
            raise ValueError("maxsize must be > 0")
        self._maxsize = maxsize
        self._store: OrderedDict[str, _T] = OrderedDict()
        self._lock = threading.RLock()

    @property
    def maxsize(self) -> int:
        return self._maxsize

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._store

    def get(self, key: str) -> _T | None:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def put(self, key: str, value: _T) -> None:
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key] = value
                return
            self._store[key] = value
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


def file_cache_key(path: Path | str) -> str:
    """Return a stable cache key for ``path`` bound to its current mtime.

    The key is SHA-256 of ``<absolute-path>|<mtime_ns>`` so a re-saved
    file invalidates the previous entry without manual bookkeeping. A
    missing file yields a key based on the path alone — callers should
    normally not cache under that key but the helper stays total so
    probe-before-load logic does not need to branch on ``FileNotFoundError``.
    """
    resolved = Path(path).resolve()
    try:
        mtime_ns = resolved.stat().st_mtime_ns
    except FileNotFoundError:
        mtime_ns = 0
    payload = f"{resolved}|{mtime_ns}".encode()
    return hashlib.sha256(payload).hexdigest()


_entity_cache: LRUCache = LRUCache(_resolve_maxsize())
_hazard_cache: LRUCache = LRUCache(_resolve_maxsize())


def get_entity_cache() -> LRUCache:
    return _entity_cache


def get_hazard_cache() -> LRUCache:
    return _hazard_cache


def clear_all() -> None:
    """Drop every cached Entity/Hazard object (cancellation, admin clear)."""
    _entity_cache.clear()
    _hazard_cache.clear()
