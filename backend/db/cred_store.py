"""DuckDB queries for CRED dataset metadata."""

from __future__ import annotations

from backend.db.connection import get_connection


def list_cred_datasets() -> list[dict]:
    """Return all CRED dataset rows ordered by upload time."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, name, source, uploaded_at, is_builtin, sha256
            FROM cred_datasets
            ORDER BY uploaded_at
            """
        ).fetchall()
        cols = ["id", "name", "source", "uploaded_at", "is_builtin", "sha256"]
        return [dict(zip(cols, r, strict=True)) for r in rows]
    finally:
        conn.close()
