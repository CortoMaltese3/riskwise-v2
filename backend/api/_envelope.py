"""Shared response envelope helpers used by every router."""

from __future__ import annotations


def _status_ok() -> dict:
    return {"code": 2000, "message": "ok"}
