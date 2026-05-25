"""Unit tests for [backend/progress.py](backend/progress.py).

Extracted from ``tests/unit/test_base_handler_utils.py`` (issue #509).
Covers issue #244 (``update_progress`` never prints to stdout) plus a
new pin test asserting that ``update_progress`` honours its cancellation
checkpoint *before* invoking the bound callback.
"""

from __future__ import annotations

import json
import threading

import pytest

from backend.cancellation import CancelRequested, cancel_event_var
from backend.progress import progress_callback_var, update_progress


class TestUpdateProgress:
    """Issue #244: ``update_progress`` must not call ``print``.

    With an SSE callback bound, the event flows through the callback. Without
    one, the event lands in the structured logger instead of stdout.
    """

    def test_callback_path_invokes_callback_and_writes_no_stdout(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        events: list[dict] = []
        token = progress_callback_var.set(events.append)
        try:
            update_progress(42, "halfway")
        finally:
            progress_callback_var.reset(token)

        captured = capsys.readouterr()
        assert captured.out == ""
        assert events == [{"type": "progress", "progress": 42, "message": "halfway"}]

    def test_fallback_path_logs_event_and_writes_no_stdout(
        self,
        capsys: pytest.CaptureFixture[str],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from backend import progress as progress_mod

        logged: list[tuple[str, str]] = []
        # structlog's BoundLogger exposes ``info`` directly — it does not
        # delegate to a generic ``log(level, message)`` method, so patching
        # the per-level entrypoint is the only way to intercept the calls.
        monkeypatch.setattr(
            progress_mod.logger,
            "info",
            lambda message: logged.append(("info", message)),
        )

        update_progress(75, "almost done")

        captured = capsys.readouterr()
        assert captured.out == ""

        # Two info logs: the structured event JSON and the legacy
        # "send progress N to frontend." breadcrumb.
        info_messages = [msg for level, msg in logged if level == "info"]
        assert any(
            json.loads(msg) == {"type": "progress", "progress": 75, "message": "almost done"}
            for msg in info_messages
            if msg.startswith("{")
        )

    def test_raises_cancel_requested_before_invoking_callback(self) -> None:
        """Cancellation checkpoint runs *before* the bound callback.

        ``update_progress`` calls ``check_cancelled()`` first, so a set
        cancel flag must short-circuit the callback. The integration test
        in ``tests/unit/test_cancellation.py`` exercises this transitively
        through the FastAPI surface; this pins the contract at the unit
        level so it can't regress silently.
        """
        event = threading.Event()
        event.set()
        cancel_token = cancel_event_var.set(event)

        callback_invocations: list[dict] = []
        callback_token = progress_callback_var.set(callback_invocations.append)

        try:
            with pytest.raises(CancelRequested):
                update_progress(10, "should-not-emit")
        finally:
            progress_callback_var.reset(callback_token)
            cancel_event_var.reset(cancel_token)

        assert callback_invocations == []
