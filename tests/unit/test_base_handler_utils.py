"""Unit tests for the pure string-munging helpers carved out of ``BaseHandler``.

Covers #14 acceptance criteria: ``beautify_hazard_type`` and
``sanitize_country_name`` run without touching CLIMADA or the filesystem.
Also covers the issue #244 contract that ``update_progress`` no longer
prints to stdout — the SSE-callback path stays untouched, and the
fallback path emits via the structured logger instead.
"""

from __future__ import annotations

import json

import pytest

from backend.progress import update_progress
from backend.utils.country import sanitize_country_name
from backend.utils.strings import beautify_hazard_type


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
    def test_known_keys_return_display_names(self, key: str, expected: str) -> None:
        assert beautify_hazard_type(key) == expected

    @pytest.mark.parametrize("key", ["earthquake", "", "unknown_hazard"])
    def test_unknown_keys_fall_back_to_generic_label(self, key: str) -> None:
        assert beautify_hazard_type(key) == "Hazard"


class TestSanitizeCountryName:
    def test_exact_name_returns_canonical_form(self) -> None:
        assert sanitize_country_name("Egypt") == "Egypt"
        assert sanitize_country_name("Thailand") == "Thailand"

    def test_fuzzy_match_returns_full_canonical_name(self) -> None:
        assert "United States" in sanitize_country_name("United States of America")

    def test_unresolvable_name_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Failed to sanitize country"):
            sanitize_country_name("Not-A-Real-Place-xyz")


class TestUpdateProgress:
    """Issue #244: ``update_progress`` must not call ``print``.

    With an SSE callback bound, the event flows through the callback. Without
    one, the event lands in the structured logger instead of stdout.
    """

    def test_callback_path_invokes_callback_and_writes_no_stdout(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from backend.progress import progress_callback_var

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
