"""Namespace isolation for the extensibility registry.

Scenario 2 of issue #56: a custom country that reuses a built-in ISO3
must be rejected at startup with a structured error rather than silently
shadowing the shipped config. This file exercises both halves of that
guarantee — the collision raises, and the good case carries a ``source``
label so the UI can distinguish the two origins.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.extensibility.registry import (
    CountrySource,
    ExtensibilityError,
    build_registry,
)

REPO_COUNTRIES_DIR = Path(__file__).resolve().parents[3] / "countries"


def _write_config(user_dir: Path, iso3: str, country_name: str) -> None:
    country_dir = user_dir / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "config_version": 1,
        "country_code": iso3,
        "country_name": country_name,
        "discount_rate": 0.05,
        "annual_growth_rate": {"crops": 0.02},
        "return_periods": {"FL": [2, 5, 10]},
        "source_references": ["fixture"],
    }
    (country_dir / "config.json").write_text(json.dumps(payload), encoding="utf-8")


class TestNamespaceCollision:
    def test_custom_egy_raises_extensibility_error(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_config(user_countries, "EGY", "Not Egypt")

        with pytest.raises(ExtensibilityError, match="shadows a built-in country"):
            build_registry(
                builtin_root=REPO_COUNTRIES_DIR,
                user_data_countries_dir=user_countries,
            )

    def test_error_message_names_iso3_and_path(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_config(user_countries, "THA", "Not Thailand")

        with pytest.raises(ExtensibilityError) as excinfo:
            build_registry(
                builtin_root=REPO_COUNTRIES_DIR,
                user_data_countries_dir=user_countries,
            )

        message = str(excinfo.value)
        assert "THA" in message
        assert str(user_countries / "THA") in message

    def test_lowercase_directory_still_collides(self, tmp_path: Path) -> None:
        """Directory names are ISO3-normalised before the collision check."""
        user_countries = tmp_path / "countries"
        _write_config(user_countries, "egy", "Lowercase shadow")

        with pytest.raises(ExtensibilityError, match="shadows a built-in country"):
            build_registry(
                builtin_root=REPO_COUNTRIES_DIR,
                user_data_countries_dir=user_countries,
            )


class TestSourceLabeling:
    def test_custom_country_carries_custom_source(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_config(user_countries, "KEN", "Kenya")

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("KEN").source is CountrySource.CUSTOM
        assert registry.get("EGY").source is CountrySource.BUILTIN
        assert registry.get("THA").source is CountrySource.BUILTIN
