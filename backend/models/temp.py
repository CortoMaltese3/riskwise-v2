"""Temporary directory clear response.

This endpoint pre-dates the ``{data, status}`` envelope used everywhere else,
so its response shape is its own model rather than a ``StatusEnvelope`` wrap.
"""

from __future__ import annotations

from pydantic import BaseModel


class TempClearResponse(BaseModel):
    success: bool
    message: str | None = None
    error: str | None = None
