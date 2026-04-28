"""Loader-side error types.

Kept in a private module so individual loader modules can import
``HazardLoadError`` without pulling in the full
:mod:`backend.engine.loaders` namespace, which would create an import
cycle once additional loaders are added.
"""

from __future__ import annotations


class HazardLoadError(ValueError):
    """Raised when a hazard file cannot be loaded into ``HazardArrays``.

    Subclasses :class:`ValueError` so existing call sites that handle
    bad-input errors generically still catch this. Specific failure
    modes (missing file, missing dataset, shape mismatch) are encoded
    in the message rather than as separate subclasses — the caller does
    not branch on them, only logs and surfaces to the user.
    """


class EntityLoadError(ValueError):
    """Raised when an entity XLSX file cannot be loaded into :class:`EntityBundle`.

    Subclasses :class:`ValueError` for the same reason as
    :class:`HazardLoadError`. The message always names the offending
    sheet, row, or column so the user can find the bad data quickly.
    """
