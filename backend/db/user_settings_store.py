"""Singleton-row store for per-install user settings (#351).

The ``user_settings`` table holds a single row keyed by ``id = 1``. The first
:func:`get_user_settings` call inserts the row with the column defaults, so
callers never see an empty result and a PATCH never has to invent the row it
is meant to update.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.db.connection import get_connection

_SETTINGS_ID = 1

# Sentinel mirroring ``update_snapshot``: distinguishes "field omitted from
# the PATCH body" (leave column untouched) from "field set to None" (would
# violate NOT NULL here, so we never expose a way to do it).
_UNSET: Any = object()


@dataclass
class UserSettingsRow:
    report_locale: str
    report_currency: str


def _row_to_settings(row: tuple) -> UserSettingsRow:
    return UserSettingsRow(report_locale=row[0], report_currency=row[1])


def get_user_settings() -> UserSettingsRow:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT report_locale, report_currency FROM user_settings WHERE id = ?",
            [_SETTINGS_ID],
        ).fetchone()
        if row is None:
            conn.execute("INSERT INTO user_settings (id) VALUES (?)", [_SETTINGS_ID])
            row = conn.execute(
                "SELECT report_locale, report_currency FROM user_settings WHERE id = ?",
                [_SETTINGS_ID],
            ).fetchone()
    finally:
        conn.close()
    assert row is not None
    return _row_to_settings(row)


def update_user_settings(
    *,
    report_locale: Any = _UNSET,
    report_currency: Any = _UNSET,
) -> UserSettingsRow:
    """Partial update of the singleton row. Returns the updated values."""
    updates: list[str] = []
    values: list[Any] = []
    if report_locale is not _UNSET:
        updates.append("report_locale = ?")
        values.append(report_locale)
    if report_currency is not _UNSET:
        updates.append("report_currency = ?")
        values.append(report_currency)
    if not updates:
        return get_user_settings()
    values.append(_SETTINGS_ID)
    update_sql = (
        f"UPDATE user_settings SET {', '.join(updates)} WHERE id = ? "
        "RETURNING report_locale, report_currency"
    )
    conn = get_connection()
    try:
        row = conn.execute(update_sql, values).fetchone()
        if row is None:
            # First-ever PATCH (no GET happened yet): create the defaults row,
            # then re-run the UPDATE so the user's values overwrite them in
            # the same connection.
            conn.execute("INSERT INTO user_settings (id) VALUES (?)", [_SETTINGS_ID])
            row = conn.execute(update_sql, values).fetchone()
    finally:
        conn.close()
    assert row is not None
    return _row_to_settings(row)
