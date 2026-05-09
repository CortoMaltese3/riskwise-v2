"""Typed status codes for the ``run_*.py`` JSON response envelope.

The historical scripts scattered the magic numbers ``2000``/``3000``/``4000``
across nine files. This enum is the single source of truth so callers
import a name instead of copy-pasting integers, and so a future change
(or addition) lands in one place.

The enum subclasses :class:`int` (via :class:`~enum.IntEnum`) so existing
consumers that compare against literal integers — both the FastAPI tests
and the legacy frontend — continue to work without changes:

>>> StatusCode.SUCCESS == 2000
True
"""

from enum import IntEnum


class StatusCode(IntEnum):
    """Response status codes used by every ``run_*.py`` command."""

    SUCCESS = 2000
    VALIDATION_ERROR = 3000
    ERROR = 4000
