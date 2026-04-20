"""Scan-time behaviour of the extensibility registry.

Covers issue #56 Scenario 1 (auto-scan + env-var override) and Scenario 3
(strict schema validation with actionable errors): a dropped-in custom
country is registered when it's valid and skipped-with-warning when it's
not, without taking the registry down.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from extensibility.registry import (
    BUILTIN_COUNTRY_CODES,
    CountrySource,
    build_registry,
)

REPO_COUNTRIES_DIR = Path(__file__).resolve().parents[3] / "countries"


def _valid_custom_config(iso3: str = "KEN", name: str = "Kenya") -> dict:
    return {
        "config_version": 1,
        "country_code": iso3,
        "country_name": name,
        "discount_rate": 0.05,
        "annual_growth_rate": {"crops": 0.02},
        "return_periods": {"FL": [2, 5, 10]},
        "source_references": ["discount_rate 5% — fixture"],
    }


def _write_country(user_dir: Path, iso3: str, config: dict | str) -> Path:
    country_dir = user_dir / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    config_path = country_dir / "config.json"
    if isinstance(config, str):
        config_path.write_text(config, encoding="utf-8")
    else:
        config_path.write_text(json.dumps(config), encoding="utf-8")
    return config_path


class TestBuiltinRegistry:
    def test_empty_user_data_yields_only_builtins(self, tmp_path: Path) -> None:
        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=tmp_path,
        )
        assert registry.codes() == BUILTIN_COUNTRY_CODES
        assert all(entry.source is CountrySource.BUILTIN for entry in registry.countries)
        assert registry.errors == ()

    def test_builtin_names_come_from_shipped_configs(self, tmp_path: Path) -> None:
        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=tmp_path,
        )
        names = {entry.code: entry.name for entry in registry.countries}
        assert names["EGY"] == "Egypt"
        assert names["THA"] == "Thailand"


class TestCustomRegistryHappyPath:
    def test_valid_custom_country_is_registered(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_country(user_countries, "KEN", _valid_custom_config("KEN", "Kenya"))

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        codes = registry.codes()
        assert codes[-1] == "KEN", "custom country should trail the built-ins"
        custom = registry.get("KEN")
        assert custom is not None
        assert custom.source is CountrySource.CUSTOM
        assert custom.name == "Kenya"
        assert custom.base_dir == user_countries / "KEN"
        assert custom.config_path == user_countries / "KEN" / "config.json"
        assert registry.errors == ()

    def test_iso3_is_case_normalized(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        _write_country(user_countries, "ken", _valid_custom_config("KEN", "Kenya"))

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("ken") is not None
        assert registry.get("KEN") is not None


class TestEnvOverride:
    def test_env_var_points_scan_at_temp_dir(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """``RISKWISE_USER_DATA_DIR`` picks up the tmp path without callers passing it."""
        user_data_root = tmp_path / "rw-user"
        user_countries = user_data_root / "countries"
        _write_country(user_countries, "KEN", _valid_custom_config("KEN", "Kenya"))
        monkeypatch.setenv("RISKWISE_USER_DATA_DIR", str(user_data_root))

        # Passing ``user_data_countries_dir=None`` would bypass the env var;
        # omitting the kwarg is the path that matters for the app startup.
        registry = build_registry(builtin_root=REPO_COUNTRIES_DIR)

        assert registry.get("KEN") is not None

    def test_empty_env_var_disables_scan(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user_data_root = tmp_path / "rw-user"
        user_countries = user_data_root / "countries"
        _write_country(user_countries, "KEN", _valid_custom_config("KEN", "Kenya"))
        monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")

        registry = build_registry(builtin_root=REPO_COUNTRIES_DIR)

        assert registry.get("KEN") is None
        assert registry.codes() == BUILTIN_COUNTRY_CODES


class TestCustomRegistryErrors:
    def test_missing_config_json_is_skipped_with_error(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        (user_countries / "KEN").mkdir(parents=True)
        # No config.json written.

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("KEN") is None
        assert len(registry.errors) == 1
        iso3, message = registry.errors[0]
        assert iso3 == "KEN"
        assert "missing config.json" in message

    def test_invalid_config_is_skipped_and_reported(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        bad = _valid_custom_config("KEN", "Kenya")
        bad["discount_rate"] = "not-a-number"  # schema violation
        _write_country(user_countries, "KEN", bad)

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("KEN") is None
        assert len(registry.errors) == 1
        iso3, message = registry.errors[0]
        assert iso3 == "KEN"
        # The error names the file *and* the offending field so the
        # analyst can fix the JSON without reading Python source.
        assert "discount_rate" in message
        assert "KEN" in message

    def test_valid_country_survives_alongside_invalid_one(self, tmp_path: Path) -> None:
        """Scenario 3: invalid drop-ins don't block valid ones from loading."""
        user_countries = tmp_path / "countries"
        _write_country(user_countries, "KEN", _valid_custom_config("KEN", "Kenya"))
        _write_country(user_countries, "XYZ", "{not valid json")

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("KEN") is not None
        assert registry.get("XYZ") is None
        assert [iso3 for iso3, _ in registry.errors] == ["XYZ"]


class TestScanIgnoresNonDirectories:
    def test_stray_files_are_ignored(self, tmp_path: Path) -> None:
        user_countries = tmp_path / "countries"
        user_countries.mkdir(parents=True)
        (user_countries / "README.md").write_text("stray", encoding="utf-8")
        _write_country(user_countries, "KEN", _valid_custom_config("KEN", "Kenya"))

        registry = build_registry(
            builtin_root=REPO_COUNTRIES_DIR,
            user_data_countries_dir=user_countries,
        )

        assert registry.get("KEN") is not None
        assert registry.errors == ()
