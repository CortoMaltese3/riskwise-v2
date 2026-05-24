"""Shared base class for the ``run_*.py`` command scripts.

Every script in :mod:`backend` that starts with ``run_`` does the same
three things:

1. Runs a small piece of compute (validating its request, hitting a
   handler, building a payload).
2. Wraps the result in the ``{"data": ..., "status": {"code": int,
   "message": str}}`` envelope the frontend expects.
3. When invoked as ``python -m backend.run_xxx '{"...": ...}'``
   (the legacy Electron subprocess contract) prints that envelope as
   JSON on stdout.

:class:`Command` owns 2 and 3 so concrete subclasses only have to
implement :py:meth:`Command.execute`. The class deliberately stays
permissive about the *shape* of the envelope (some commands returned
``{"success": True, "message": ...}`` rather than the standard
``{"data": ..., "status": ...}`` envelope) because the FastAPI
endpoints already depend on those exact shapes; this base class
consolidates the boilerplate, not the schema.
"""

from __future__ import annotations

import json
import sys
from abc import ABC, abstractmethod
from typing import Any

from backend.cli.status_codes import StatusCode
from backend.logging_config import get_logger


class Command(ABC):
    """Template method base class for the ``run_*.py`` command scripts.

    Subclasses implement :py:meth:`execute` — the actual unit of work — and
    optionally override :py:meth:`error_envelope` to produce a
    well-shaped response when an unhandled exception slips through. The
    public entry point is :py:meth:`run`, which wraps :py:meth:`execute`
    in a try/except that translates any unhandled error into the
    standard ``status.code = ERROR`` envelope so the frontend never
    sees a bare 500.

    The subprocess shim is :py:meth:`main`. Concrete scripts call it
    from their ``if __name__ == "__main__":`` block and it handles
    JSON-decoding ``sys.argv[1]`` (when expected), instantiating the
    command, running it, and printing the JSON result.
    """

    #: Set to ``True`` when the subclass's constructor takes a request
    #: dict (decoded from ``sys.argv[1]``). Set to ``False`` for
    #: argument-less commands.
    requires_request: bool = True

    def __init__(self) -> None:
        self.logger = get_logger("backend.cli.base")

    # ------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------
    @abstractmethod
    def execute(self) -> dict[str, Any]:
        """Run the command and return the response envelope.

        Implementations should return the full ``{"data": ..., "status":
        ...}`` dictionary the FastAPI endpoint will hand back to the
        frontend. They may raise — :py:meth:`run` will translate any
        unhandled exception into :py:meth:`error_envelope`.
        """

    def error_envelope(self, exc: Exception) -> dict[str, Any]:
        """Return the envelope to use when :py:meth:`execute` raises.

        The default shape mirrors the ``{"data": {}, "status": {...}}``
        contract used by most callers. Subclasses whose ``data`` field
        has a non-trivial fallback shape (e.g. a list, ``None``, or a
        dict with required keys) override this so the response stays
        Pydantic-validatable on the FastAPI side.
        """
        return {
            "data": {},
            "status": {
                "code": StatusCode.ERROR,
                "message": f"An unexpected error occurred. More info: {exc}",
            },
        }

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def run(self) -> dict[str, Any]:
        """Run :py:meth:`execute` and translate failures into envelopes."""
        try:
            return self.execute()
        except Exception as exc:  # noqa: BLE001 - boundary translation
            self.logger.error(f"Unhandled error in {type(self).__name__}: {exc}")
            return self.error_envelope(exc)

    # ------------------------------------------------------------------
    # Subprocess shim (legacy Electron contract)
    # ------------------------------------------------------------------
    @classmethod
    def main(cls, argv: list[str] | None = None) -> dict[str, Any]:
        """Decode ``argv[1]`` (if expected), run the command, return JSON.

        Returns the response envelope so callers (and tests) can assert
        on it. Subclasses with non-standard constructor signatures
        override this; the stock implementation handles the two
        common shapes: zero-arg constructors and single-dict constructors.

        The legacy Electron subprocess contract — ``print(json.dumps(...))``
        on stdout — lives in each script's ``if __name__ == "__main__":``
        block. Keeping the print at the actual entry point (and out of the
        shared base) lets tests call :py:meth:`main` without capturing
        stdout, and keeps the ``backend/`` tree free of progress/debug
        ``print`` calls outside CLI entry-points (issue #244).
        """
        argv = list(sys.argv if argv is None else argv)
        if cls.requires_request:
            request = json.loads(argv[1]) if len(argv) > 1 else {}
            instance = cls(request)  # type: ignore[call-arg]
        else:
            instance = cls()
        return instance.run()
