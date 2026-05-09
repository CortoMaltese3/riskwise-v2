"""Shared infrastructure for the ``run_*.py`` command scripts.

The ``backend/run_*.py`` scripts are thin command wrappers that the FastAPI
endpoints invoke in-process and that the historical Electron shell could
also spawn as subprocesses (printing the result envelope as JSON to stdout).

This package centralises the two pieces every script duplicated:

- :mod:`backend.cli.status_codes` — the magic ``2000``/``3000``/``4000``
  numbers as a typed :class:`~enum.IntEnum` so callers stop scattering
  literals across the codebase.
- :mod:`backend.cli.base` — a :class:`~backend.cli.base.Command` base
  class that owns the try/except shape, the JSON response envelope, and
  the ``__main__`` subprocess entry point.
"""

from backend.cli.base import Command
from backend.cli.status_codes import StatusCode

__all__ = ["Command", "StatusCode"]
