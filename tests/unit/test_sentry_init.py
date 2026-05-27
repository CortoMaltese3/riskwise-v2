"""Unit tests for backend Sentry breadcrumb forwarding (issue #308).

The acceptance criterion is that `logging.getLogger("riskwise").info(...)`
calls before a captured event become breadcrumbs on that event's payload.
We exercise the integration end-to-end against the real `sentry_sdk` by
plugging a capturing transport into `sentry_sdk.init` so the assertions
read the actual envelope the SDK would send over the wire.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

# Skip the whole module when ``sentry-sdk`` is not installed (e.g. a
# minimal lint container). The runtime path mirrors this: ``init_sentry``
# returns False in that case rather than booting half-configured.
sentry_sdk = pytest.importorskip("sentry_sdk")


from backend.logging_config import configure_logging, get_logger  # noqa: E402
from backend.sentry_init import _resolve_breadcrumb_level, init_sentry  # noqa: E402


class _CapturingTransport(sentry_sdk.Transport):
    """Sentry transport that stores every captured envelope in-memory."""

    def __init__(self) -> None:
        super().__init__()
        self.events: list[dict[str, Any]] = []

    def capture_event(self, event):  # pragma: no cover - SDK calls one or the other
        self.events.append(event)

    def capture_envelope(self, envelope):
        for item in envelope.items:
            payload = item.payload.json
            if isinstance(payload, dict):
                self.events.append(payload)


@pytest.fixture
def isolated_sentry(monkeypatch: pytest.MonkeyPatch):
    """Init sentry against a capturing transport and restore stdlib state."""
    monkeypatch.setenv("SENTRY_DSN", "https://public@sentry.example/0")
    monkeypatch.setenv("SENTRY_BREADCRUMB_LEVEL", "INFO")
    transport = _CapturingTransport()

    # Bypass ``init_sentry`` to inject the transport, but reuse the same
    # LoggingIntegration spec the production path uses so behaviour stays
    # identical to what users get.
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn="https://public@sentry.example/0",
        transport=transport,
        integrations=[LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)],
        default_integrations=False,
    )
    # Root defaults to WARNING; lower so the integration's handler sees INFO
    # records, mirroring what ``init_sentry`` does in production.
    prior_root = logging.getLogger().level
    prior_riskwise = logging.getLogger("riskwise").level
    logging.getLogger().setLevel(logging.INFO)
    logging.getLogger("riskwise").setLevel(logging.INFO)
    # The structlog mirror processor depends on ``configure_logging`` having
    # run at least once so the pipeline is in place.
    configure_logging()

    yield transport

    logging.getLogger().setLevel(prior_root)
    logging.getLogger("riskwise").setLevel(prior_riskwise)

    sentry_sdk.get_client().close()
    # Drop handlers Sentry attached to root so subsequent tests start clean.
    for handler in list(logging.getLogger().handlers):
        if "sentry" in handler.__class__.__module__.lower():
            logging.getLogger().removeHandler(handler)


def _all_breadcrumbs(event: dict[str, Any]) -> list[dict[str, Any]]:
    crumbs = event.get("breadcrumbs")
    if isinstance(crumbs, dict):
        return crumbs.get("values", [])
    if isinstance(crumbs, list):
        return crumbs
    return []


def test_info_lines_become_breadcrumbs_on_next_event(isolated_sentry):
    """`logging.getLogger("riskwise").info(...)` rides along with the next event."""
    logging.getLogger("riskwise").info("preparing scenario abc")
    logging.getLogger("riskwise").info("loading exposure xyz")

    sentry_sdk.capture_message("synthetic crash")
    sentry_sdk.flush(timeout=2.0)

    assert isolated_sentry.events, "Sentry transport never received the event"
    event = isolated_sentry.events[-1]
    messages = [c.get("message", "") for c in _all_breadcrumbs(event)]
    assert any("preparing scenario abc" in m for m in messages)
    assert any("loading exposure xyz" in m for m in messages)


def test_error_lines_capture_an_event(isolated_sentry):
    """ERROR-level lines fire an event on their own (event_level=ERROR)."""
    logging.getLogger("riskwise").error("scenario.failed: out of memory")
    sentry_sdk.flush(timeout=2.0)

    assert isolated_sentry.events, "ERROR log line did not produce a Sentry event"
    payload_blob = str(isolated_sentry.events)
    assert "scenario.failed" in payload_blob


def test_structlog_records_are_mirrored_into_breadcrumbs(isolated_sentry):
    """The mirror processor in `logging_config` keeps structlog → Sentry alive."""
    log = get_logger("riskwise.scenario")
    log.info("structlog.preflight", country="EGY")

    sentry_sdk.capture_message("after preflight")
    sentry_sdk.flush(timeout=2.0)

    event = isolated_sentry.events[-1]
    messages = [c.get("message", "") for c in _all_breadcrumbs(event)]
    assert any("structlog.preflight" in m for m in messages)


def test_init_is_a_no_op_without_a_dsn(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert init_sentry() is False


def test_breadcrumb_level_resolves_known_values():
    assert _resolve_breadcrumb_level(None) == logging.INFO
    assert _resolve_breadcrumb_level("") == logging.INFO
    assert _resolve_breadcrumb_level("DEBUG") == logging.DEBUG
    assert _resolve_breadcrumb_level("warn") == logging.WARNING
    assert _resolve_breadcrumb_level("warning") == logging.WARNING
    assert _resolve_breadcrumb_level("ERROR") == logging.ERROR
    # Unknown spellings fall back to INFO rather than refusing to boot.
    assert _resolve_breadcrumb_level("nonsense") == logging.INFO
