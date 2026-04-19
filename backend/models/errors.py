"""Structured error envelope used by FastAPI exception handlers.

Every non-2xx response (from explicit ``HTTPException`` or an unhandled
exception) is serialized into an :class:`ErrorResponse`. The renderer uses
``error_id`` to correlate a user-facing toast with the backend log entry for
the same failure.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    code: str = Field(..., description="Machine-readable error code (snake_case).")
    message: str = Field(..., description="Human-readable summary for display.")
    detail: str | None = Field(
        default=None,
        description="Additional diagnostic context; never shown as the primary message.",
    )
    error_id: str = Field(..., description="UUID for log correlation.")
