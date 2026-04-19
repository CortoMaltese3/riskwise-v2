"""Cooperative cancellation plumbing for the FastAPI backend.

The scenario runner executes inside a worker thread (``asyncio.to_thread``),
so the usual ``asyncio.CancelledError`` pathway does not reach it. Instead,
each in-flight job installs a :class:`threading.Event` on a context variable;
long-running stages call :func:`check_cancelled` between CLIMADA steps and
bail out by raising :class:`CancelRequested`.

:class:`CancelRequested` inherits from :class:`BaseException` on purpose: the
scenario runner's per-stage ``except Exception`` blocks must not swallow a
cancellation, otherwise the worker would keep crunching after the user
aborted.
"""

from __future__ import annotations

import threading
from contextvars import ContextVar

cancel_event_var: ContextVar[threading.Event | None] = ContextVar(
    "riskwise_cancel_event", default=None
)


class CancelRequested(BaseException):
    """Raised at a cancellation checkpoint when the cancel flag is set."""


def check_cancelled() -> None:
    event = cancel_event_var.get()
    if event is not None and event.is_set():
        raise CancelRequested("Scenario run was cancelled")
