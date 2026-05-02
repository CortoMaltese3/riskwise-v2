"""Unit tests for the pure string-munging methods on ``BaseHandler``.

Covers #14 acceptance criteria: ``beautify_hazard_type`` and
``sanitize_country_name`` run without touching CLIMADA or the filesystem.
"""

from __future__ import annotations

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
