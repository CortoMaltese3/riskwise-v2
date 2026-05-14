"""Structured error envelope and domain exception taxonomy.

The taxonomy at the bottom of this module is the project-wide replacement
for ad-hoc ``except Exception`` clauses (architecture rule #7). Domain code
raises a :class:`RiskWiseError` subclass; the FastAPI boundary in
``backend/app.py`` translates the subclass to an HTTP status and a typed
``code`` on the :class:`ErrorResponse` envelope so the renderer can react
on the code, not on a stringified Python exception.

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
    request_id: str | None = Field(
        default=None,
        description=(
            "End-to-end request correlation ID copied from the ``X-Request-ID`` "
            "header. Echoed on the toast so users can quote a single UUID that "
            "matches entries in the Electron main log and the Python backend log."
        ),
    )


# ---------------------------------------------------------------------------
# Domain exception taxonomy
# ---------------------------------------------------------------------------
#
# These are the narrow, intent-bearing exceptions the backend raises in place
# of bare ``except Exception`` clauses. Each subclass advertises a stable
# ``code`` and ``http_status`` that the FastAPI handler reads when building
# the error envelope, so a UI can switch on ``code`` (e.g. ``"data_load"``)
# without parsing free-form messages.


class RiskWiseError(Exception):
    """Base class for every domain exception raised by the backend.

    Subclasses set:

    * :attr:`code` — the snake_case identifier copied onto
      :class:`ErrorResponse.code`. Stable across releases; the frontend
      may switch on it.
    * :attr:`http_status` — the HTTP status the FastAPI boundary returns.
    * :attr:`message` — short human-readable summary for display.

    Callers may pass a plain string (used as the message) or override the
    default code/status via keyword arguments.
    """

    code: str = "internal_error"
    http_status: int = 500
    message: str = "An internal error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        http_status: int | None = None,
    ) -> None:
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        super().__init__(self.message)


class CatalogError(RiskWiseError):
    """A catalog lookup (countries, hazards, datasets registry) failed.

    Indicates the requested (country, hazard) tuple is not present in the
    bundled or user-supplied catalog. Surfaces as ``404 not_found`` so the
    UI can prompt the user to pick a different selection.
    """

    code = "catalog_not_found"
    http_status = 404
    message = "Requested catalog entry is not available."


class DataLoadError(RiskWiseError):
    """Loading a hazard / exposure / entity / metadata file failed.

    Covers missing files, unreadable archives, invalid JSON, and malformed
    rows in xlsx / GeoPackage / HDF5 inputs. Surfaces as ``400`` because
    the input file (whether shipped or user-supplied) cannot be parsed.
    """

    code = "data_load"
    http_status = 400
    message = "Failed to load required data."


class ValidationError(RiskWiseError):
    """A request payload or data value violates a domain invariant.

    Distinct from :class:`fastapi.exceptions.RequestValidationError`
    (which covers schema-level Pydantic validation): this is raised by
    handlers when the *content* of an otherwise well-formed payload is
    invalid (unknown country, malformed measure parameters, etc.).
    """

    code = "validation_error"
    http_status = 422
    message = "Request payload failed domain validation."


class EngineError(RiskWiseError):
    """A call into ``climate-lama-engine`` (or its adapter) failed.

    Used when the engine raises during impact / cost-benefit / hazard
    construction. Surfaces as ``500`` because the adapter is internal —
    the user did nothing wrong, the run cannot complete.
    """

    code = "engine_error"
    http_status = 500
    message = "Engine computation failed."


class UploadTooLargeError(RiskWiseError):
    """A user-supplied upload (xlsx, ZIP) exceeds the configured size cap.

    Raised by :func:`backend.uploads.enforce_upload_size_limit` before any
    parsing or extraction runs, so that an oversized archive cannot drive
    a zip-bomb-style decompression (ARCHITECTURE.md Area 18). Surfaces as
    ``413 upload_too_large`` so the renderer can present a precise toast
    rather than the generic ``data_load`` / ``http_error`` envelope it
    would otherwise see for a 400.
    """

    code = "upload_too_large"
    http_status = 413
    message = "Uploaded file exceeds the maximum allowed size."
