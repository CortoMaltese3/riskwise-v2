"""Unit tests for the pure string-munging methods on ``BaseHandler``.

Covers #14 acceptance criteria: ``beautify_hazard_type`` and
``sanitize_country_name`` run without touching CLIMADA or the filesystem.
Also covers the issue #244 contract that ``update_progress`` no longer
prints to stdout — the SSE-callback path stays untouched, and the
fallback path emits via the structured logger instead.
"""

from __future__ import annotations

import json

import pytest

from backend.base_handler import BaseHandler


@pytest.fixture(scope="module")
def handler() -> BaseHandler:
    return BaseHandler()


class TestBeautifyHazardType:
    @pytest.mark.parametrize(
        ("key", "expected"),
        [
            ("tropical_cyclone", "Tropical cyclone"),
            ("storm_europe", "Storm Europe"),
            ("river_flood", "River flood"),
            ("drought", "Drought"),
            ("flood", "Flood"),
            ("heatwaves", "Heatwaves"),
        ],
    )
    def test_known_keys_return_display_names(
        self, handler: BaseHandler, key: str, expected: str
    ) -> None:
        assert handler.beautify_hazard_type(key) == expected

    @pytest.mark.parametrize("key", ["earthquake", "", "unknown_hazard"])
    def test_unknown_keys_fall_back_to_generic_label(self, handler: BaseHandler, key: str) -> None:
        assert handler.beautify_hazard_type(key) == "Hazard"


class TestSanitizeCountryName:
    def test_exact_name_returns_canonical_form(self, handler: BaseHandler) -> None:
        assert handler.sanitize_country_name("Egypt") == "Egypt"
        assert handler.sanitize_country_name("Thailand") == "Thailand"

    def test_fuzzy_match_returns_full_canonical_name(self, handler: BaseHandler) -> None:
        assert "United States" in handler.sanitize_country_name("United States of America")

    def test_unresolvable_name_raises_value_error(self, handler: BaseHandler) -> None:
        with pytest.raises(ValueError, match="Failed to sanitize country"):
            handler.sanitize_country_name("Not-A-Real-Place-xyz")


class TestUpdateProgress:
    """Issue #244: ``update_progress`` must not call ``print``.

    With an SSE callback bound, the event flows through the callback. Without
    one, the event lands in the structured logger instead of stdout.
    """

    def test_callback_path_invokes_callback_and_writes_no_stdout(
        self, handler: BaseHandler, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from backend.progress import progress_callback_var

        events: list[dict] = []
        token = progress_callback_var.set(events.append)
        try:
            handler.update_progress(42, "halfway")
        finally:
            progress_callback_var.reset(token)

        captured = capsys.readouterr()
        assert captured.out == ""
        assert events == [{"type": "progress", "progress": 42, "message": "halfway"}]

    def test_fallback_path_logs_event_and_writes_no_stdout(
        self,
        handler: BaseHandler,
        capsys: pytest.CaptureFixture[str],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from backend import base_handler as base_handler_mod

        logged: list[tuple[str, str]] = []
        monkeypatch.setattr(
            base_handler_mod.logger,
            "log",
            lambda level, message: logged.append((level, message)),
        )

        handler.update_progress(75, "almost done")

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
