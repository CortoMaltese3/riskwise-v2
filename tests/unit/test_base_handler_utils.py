"""Unit tests for the pure string-munging helpers carved out of ``BaseHandler``.

Covers #14 acceptance criteria: ``beautify_hazard_type`` and
``sanitize_country_name`` run without touching CLIMADA or the filesystem.
"""

from __future__ import annotations

import pytest

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
