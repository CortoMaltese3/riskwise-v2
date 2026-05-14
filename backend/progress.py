"""Progress callback plumbing for the FastAPI backend.

Scenario runs and other long-running handlers call :func:`update_progress`
from deep inside synchronous CLIMADA code. The FastAPI SSE endpoint needs
those updates to reach a per-job ``asyncio.Queue`` without the handlers
having to know which job they belong to.

The mechanism is a :class:`contextvars.ContextVar`. The HTTP layer sets
the callback before dispatching a job; ``asyncio.to_thread`` propagates
the context into the worker thread; :func:`update_progress` reads and
invokes it. When the callback is unset (e.g. running a ``run_*.py``
script standalone), the event lands in the structured logger instead.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from contextvars import ContextVar

from backend.logging_config import get_logger

logger = get_logger("backend.progress")

ProgressEvent = dict
ProgressCallback = Callable[[ProgressEvent], None]

progress_callback_var: ContextVar[ProgressCallback | None] = ContextVar(
    "riskwise_progress_callback", default=None
)


def update_progress(progress: int, message: str) -> None:
    """Emit a progress event for the frontend, with a cancellation checkpoint.

    Routes the event through the per-job SSE callback when one is bound;
    otherwise falls back to the structured logger so ``run_*.py`` scripts
    still produce visible progress in the rotating file log. Each call
    also raises :class:`backend.cancellation.CancelRequested` when the
    caller has signalled cancellation.
    """
    from backend.cancellation import check_cancelled

    check_cancelled()

    progress_data = {"type": "progress", "progress": progress, "message": message}
    callback = progress_callback_var.get()
    if callback is not None:
        callback(progress_data)
    else:
        logger.info(json.dumps(progress_data))
    logger.info(f"send progress {progress} to frontend.")
