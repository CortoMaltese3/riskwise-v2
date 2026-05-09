"""Structured JSON logging for the RISK WISE backend.

Every log line is a single JSON object on stderr (and, when configured, a
rotating log file under ``LOG_DIR``). The ``request_id`` field is bound
from a :class:`~contextvars.ContextVar` set by the request-ID middleware in
``app.py`` so one UUID correlates every log line produced while serving a
request with the same UUID in the Electron main log and the user-facing
error toast.

Keeping this module structlog-only (no stdlib ``logging`` interop) keeps
the JSON pipeline as the single source of truth for backend log lines:
the legacy stdlib-based logger module was retired in #245 and every
handler now binds a ``get_logger(__name__)`` at import time.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from pathlib import Path
from typing import Any

import structlog

# Unbound sentinel kept as a dash so lines produced outside a request
# (startup, shutdown, CLI scripts) are still valid JSON and visually
# distinct from real UUIDs when scanning logs.
_UNBOUND_REQUEST_ID = "-"

request_id_var: ContextVar[str] = ContextVar("request_id", default=_UNBOUND_REQUEST_ID)

# Files opened by the last call to configure_logging, so a subsequent call
# (typically a test swapping the output stream) can close them first and
# avoid leaking file descriptors.
_owned_files: list[Any] = []


def _add_request_id(_logger: Any, _method_name: str, event_dict: dict) -> dict:
    event_dict.setdefault("request_id", request_id_var.get())
    return event_dict


def configure_logging(
    log_dir: Path | None = None,
    *,
    level: str = "INFO",
    stream: Any | None = None,
) -> None:
    """Install the JSON structlog pipeline.

    Called once from ``app.run()`` (and from tests that want isolated
    output). When ``log_dir`` is provided we append to
    ``<log_dir>/backend.log``; otherwise only ``stream`` (default stderr)
    receives output. The frontend's electron-log handles rotation on the
    Electron side; the Python file is a plain append log sized by
    ``RotatingFileHandler``-equivalent behaviour deferred to the
    Electron-side archival pass.
    """
    level_no = logging.getLevelName(level) if isinstance(level, str) else level
    if not isinstance(level_no, int):
        level_no = logging.INFO

    for handle in _owned_files:
        try:
            handle.close()
        except OSError:
            pass
    _owned_files.clear()

    targets: list[Any] = [stream if stream is not None else sys.stderr]
    if log_dir is not None:
        log_dir.mkdir(parents=True, exist_ok=True)
        # Line-buffered so crash-time output isn't lost behind a 4 KB buffer.
        handle = (log_dir / "backend.log").open("a", encoding="utf-8", buffering=1)
        _owned_files.append(handle)
        targets.append(handle)

    processors: list[Any] = [
        _add_request_id,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level_no),
        # _MultiStream satisfies the write/flush protocol structlog needs
        # but is not a TextIO subclass, hence the cast.
        logger_factory=structlog.WriteLoggerFactory(file=_MultiStream(targets)),  # type: ignore[arg-type]
        cache_logger_on_first_use=False,
    )


def get_logger(name: str | None = None):
    """Return a bound structlog logger; ``name`` becomes the ``logger`` field.

    ``structlog.get_logger(name)`` does not auto-attach the name to the log
    record when using :class:`structlog.WriteLoggerFactory`; binding it
    explicitly keeps our JSON lines self-describing.
    """
    logger = structlog.get_logger()
    if name:
        logger = logger.bind(logger=name)
    return logger


def bind_request_id(request_id: str):
    """Set the contextvar and return the token used to reset it.

    Callers should always use this via ``try/finally`` (or the middleware)
    so the var is reset even on exceptions.
    """
    return request_id_var.set(request_id)


def reset_request_id(token) -> None:
    request_id_var.reset(token)


class _MultiStream:
    """Minimal write-only tee so structlog's single file= can fan out."""

    def __init__(self, streams: list[Any]) -> None:
        self._streams = streams

    def write(self, message: str) -> None:
        for stream in self._streams:
            try:
                stream.write(message)
            except (OSError, ValueError):
                # A broken stream (closed file -> ValueError, detached
                # stderr during shutdown -> OSError/BrokenPipeError) must
                # not break the remaining sinks.
                pass

    def flush(self) -> None:
        for stream in self._streams:
            try:
                stream.flush()
            except (OSError, ValueError):
                pass
