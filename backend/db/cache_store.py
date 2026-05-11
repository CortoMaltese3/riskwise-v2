"""DuckDB-backed computation cache for scenario results.

A scenario run that has already been computed is expensive to repeat:
CLIMADA rebuilds the impact matrix, the geojson encoder re-traverses
every centroid, and the parquet reports are re-materialised. When the
inputs are identical (country, hazard, scenario, exposure, years,
growth, plus SHA-256 of the underlying entity/hazard files) the output
is deterministic and can be served straight from the ``computation_cache``
table defined in ``migrations/0001_initial.sql``.

The table schema stores one row per ``cache_key`` with a single blob; the
runner serialises its bundle of per-artifact blobs with :func:`encode_bundle`
before calling :func:`put`, and round-trips via :func:`decode_bundle`.
"""

from __future__ import annotations

import hashlib
import json
from base64 import b64decode, b64encode

from backend.db.connection import get_connection


def derive_cache_key(
    *,
    country: str,
    hazard_type: str,
    scenario: str,
    exposure_type: str,
    ref_year: int,
    future_year: int,
    annual_growth: float,
    entity_sha256: str,
    hazard_sha256: str,
    selected_measure_ids: list[str] | None = None,
) -> str:
    """Stable SHA-256 over the scenario identity tuple.

    The inputs mirror the tuple listed in issue #83: any change (a
    different growth rate, a fresher entity file) produces a different
    key and therefore a cache miss. ``asset_type`` is intentionally
    excluded — ``exposure_type`` already uniquely identifies the asset.

    ``selected_measure_ids`` participates in the key when set so two runs
    with different measure subsets do not collide. ``None`` keeps the
    legacy "use every measure" key shape for backwards-compatibility.
    """
    parts = [
        country,
        hazard_type,
        scenario,
        exposure_type,
        str(ref_year),
        str(future_year),
        f"{annual_growth:.12g}",
        entity_sha256,
        hazard_sha256,
    ]
    if selected_measure_ids is not None:
        # Sort for order-independence; the selection is a set, not a list.
        parts.append("measures=" + ",".join(sorted(selected_measure_ids)))
    payload = "|".join(parts)
    return hashlib.sha256(payload.encode()).hexdigest()


def get(cache_key: str) -> bytes | None:
    """Return the blob stored under ``cache_key`` or ``None`` if absent."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT data FROM computation_cache WHERE cache_key = ?",
            [cache_key],
        ).fetchone()
        if row is None:
            return None
        return bytes(row[0]) if row[0] is not None else None
    finally:
        conn.close()


def put(cache_key: str, result_type: str, data: bytes) -> None:
    """Insert or replace the blob under ``cache_key``.

    ``result_type`` is stored alongside the payload as a tag for later
    introspection (e.g. a support tool listing cache contents); the
    primary key is ``cache_key`` alone.
    """
    conn = get_connection()
    try:
        conn.execute("DELETE FROM computation_cache WHERE cache_key = ?", [cache_key])
        conn.execute(
            """
            INSERT INTO computation_cache (cache_key, result_type, data)
            VALUES (?, ?, ?)
            """,
            [cache_key, result_type, data],
        )
    finally:
        conn.close()


def clear() -> None:
    """Drop every row in ``computation_cache`` (admin / test reset)."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM computation_cache")
    finally:
        conn.close()


def encode_bundle(bundle: dict[str, bytes]) -> bytes:
    """Serialise a ``{result_type: blob}`` dict to a single cache-ready blob.

    Base64 is used so DuckDB stores the payload as straight UTF-8 JSON;
    blobs round-trip losslessly and the format stays self-describing if
    a support tool ever needs to ``json.loads`` a row by hand.
    """
    encoded = {k: b64encode(v).decode("ascii") for k, v in bundle.items()}
    return json.dumps(encoded, sort_keys=True).encode("utf-8")


def decode_bundle(data: bytes) -> dict[str, bytes]:
    """Inverse of :func:`encode_bundle`."""
    encoded = json.loads(data.decode("utf-8"))
    return {k: b64decode(v) for k, v in encoded.items()}
