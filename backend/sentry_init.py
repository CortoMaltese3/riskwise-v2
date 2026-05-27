"""Optional Sentry SDK init for the RISK WISE Python backend (issue #308).

The Electron main process owns user-facing crash reporting (#119, #300).
This module is the backend half: when ``SENTRY_DSN`` is in the process
environment (Electron only forwards it when the user has opted in), we
wire :class:`sentry_sdk.integrations.logging.LoggingIntegration` so that
``logging`` lines at ``SENTRY_BREADCRUMB_LEVEL`` and above ride along
with every captured event as breadcrumbs, and ``ERROR`` and above also
capture an event in their own right. This is the standard Sentry pattern
documented at https://docs.sentry.io/platforms/python/integrations/logging/.

Privacy gate: ``init_sentry`` is a no-op when ``SENTRY_DSN`` is unset, so
in-process Sentry is dormant for opted-out / no-DSN / forked builds. The
Electron main process scrubs ``SENTRY_DSN`` from the spawn environment
unless the user has opted into continuous crash reporting (see
``public/electron.js``: ``sentryAllowSends`` + ``createPythonProcess``).
"""

from __future__ import annotations

import logging
import os

_VALID_LEVELS = {"DEBUG", "INFO", "WARNING", "WARN", "ERROR", "CRITICAL"}
_DEFAULT_LEVEL = "INFO"


def _resolve_breadcrumb_level(raw: str | None) -> int:
    """Map ``SENTRY_BREADCRUMB_LEVEL`` to a logging level int.

    Unknown / unset values fall back to ``INFO`` to match the Electron
    transport's default. ``WARN`` is accepted as an alias for ``WARNING``
    so the two ecosystems can share one env var spelling.
    """
    if not raw:
        return logging.INFO
    upper = raw.strip().upper()
    if upper not in _VALID_LEVELS:
        return logging.INFO
    if upper == "WARN":
        upper = "WARNING"
    return logging.getLevelName(upper)  # type: ignore[return-value]


def init_sentry() -> bool:
    """Initialize Sentry if ``SENTRY_DSN`` is set; return whether it ran.

    Safe to call multiple times — Sentry's own SDK tolerates re-init, and
    the lazy import means importing this module does not pull
    ``sentry_sdk`` into processes that never call ``init_sentry``.
    """
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        # Bundle / dev environment without sentry-sdk installed — degrade
        # silently rather than refusing to boot the backend.
        return False

    breadcrumb_level = _resolve_breadcrumb_level(os.environ.get("SENTRY_BREADCRUMB_LEVEL"))
    logging_integration = LoggingIntegration(
        level=breadcrumb_level,
        event_level=logging.ERROR,
    )
    sentry_sdk.init(
        dsn=dsn,
        release=os.environ.get("RISKWISE_APP_VERSION") or None,
        environment=os.environ.get("RISKWISE_SENTRY_ENV", "production"),
        integrations=[logging_integration],
        # Crash reports only — performance traces would inflate the
        # Developer-tier quota the issue's cost analysis assumed.
        traces_sample_rate=0.0,
    )
    # Stdlib ``logging`` defaults the root logger to WARNING, so an INFO
    # record would be filtered out before reaching the SentryHandler. Lower
    # the root level (and the ``riskwise`` namespace, where most app code
    # lives via the structlog mirror) to the configured breadcrumb floor so
    # the integration actually sees the lines we want forwarded.
    logging.getLogger().setLevel(min(breadcrumb_level, logging.INFO))
    logging.getLogger("riskwise").setLevel(breadcrumb_level)
    return True
