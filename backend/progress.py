"""Progress callback plumbing for the FastAPI backend.

Scenario runs and other long-running handlers call
``BaseHandler.update_progress`` from deep inside synchronous CLIMADA code. The
FastAPI SSE endpoint needs those updates to reach a per-job ``asyncio.Queue``
without the handlers having to know which job they belong to.

The mechanism is a :class:`contextvars.ContextVar`. The HTTP layer sets the
callback before dispatching a job; ``asyncio.to_thread`` propagates the
context into the worker thread; ``update_progress`` reads and invokes it.
When the callback is unset (e.g. running a ``run_*.py`` script standalone),
``update_progress`` falls back to stdout.
"""

from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar

ProgressEvent = dict
ProgressCallback = Callable[[ProgressEvent], None]

progress_callback_var: ContextVar[ProgressCallback | None] = ContextVar(
    "riskwise_progress_callback", default=None
)
