"""Unit tests for ``backend/countries/loader.py``.

Covers #49 acceptance criteria for the country config loader: happy-path
loads of the bundled EGY/THA configs (which doubles as the numeric
regression snapshot for the values previously hardcoded in
``backend/run_scenario.py``), and structured-error behaviour for missing
files, invalid JSON, missing keys, and wrong-typed values.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from countries.loader import CountryConfig, CountryConfigError, load_country_config

REPO_ROOT = Path(__file__).resolve().parents[2]


def _valid_config_payload() -> dict:
    return {
        "config_version": 1,
        "country_code": "TST",
        "country_name": "Testland",
        "discount_rate": 0.05,
        "annual_growth_rate": {"crops": 0.02, "roads": 0.01},
        "return_periods": {"FL": [2, 5, 10], "D": [10, 25, 50]},
        "source_references": ["discount_rate 5% — fixture"],
    }


def _write(tmp_path: Path, iso3: str, payload) -> Path:
    country_dir = tmp_path / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    path = country_dir / "config.json"
    if isinstance(payload, str):
        path.write_text(payload, encoding="utf-8")
    else:
        path.write_text(json.dumps(payload), encoding="utf-8")
    return path


class TestBundledConfigsSnapshot:
    """The bundled configs encode the constants that used to live inline in
    ``run_scenario.py``. Asserting them here is the cheap regression for
    "AAL/expected damage unchanged after the refactor": the downstream
    arithmetic is unchanged, so identical inputs guarantee identical outputs.
    """

    def test_egypt_constants_match_pre_refactor_values(self) -> None:
        config = load_country_config("EGY")
        assert config.country_code == "EGY"
        assert config.country_name == "Egypt"
        assert config.config_version == 1
        assert config.discount_rate == pytest.approx(0.0689)
        assert config.annual_growth_rate == {
            "crops": pytest.approx(0.04),
            "livestock": pytest.approx(0.04),
            "power_plants": pytest.approx(0.04),
            "hotels": pytest.approx(0.04),
            "hospitalised_people": pytest.approx(0.0129),
            "students": pytest.approx(0.0129),
            "diarrhea_patients": pytest.approx(0.0129),
            "roads": pytest.approx(0.0129),
        }
        assert config.return_periods == {
            "FL": (2, 5, 10, 25),
            "D": (10, 25, 50, 75, 100),
            "HW": (10, 25, 50, 75, 100),
        }
        assert config.source_references and all(
            isinstance(ref, str) for ref in config.source_references
        )

    def test_thailand_constants_match_pre_refactor_values(self) -> None:
        config = load_country_config("THA")
        assert config.country_code == "THA"
        assert config.country_name == "Thailand"
        assert config.discount_rate == pytest.approx(0.0090)
        assert config.annual_growth_rate == {
            "tree_crops": pytest.approx(0.0294),
            "grass_crops": pytest.approx(0.0294),
            "wet_markets": pytest.approx(0.0294),
            "grass_crops_farmers": pytest.approx(-0.0022),
            "tree_crops_farmers": pytest.approx(-0.0022),
            "buddhist_monks": pytest.approx(-0.0022),
            "diarrhea_patients": pytest.approx(-0.0022),
            "students": pytest.approx(-0.0022),
            "roads": pytest.approx(-0.0022),
        }
        assert config.return_periods["FL"] == (2, 5, 10, 25)


class TestLoadHappyPath:
    def test_lowercase_iso_is_normalized(self, tmp_path: Path) -> None:
        _write(tmp_path, "TST", _valid_config_payload())
        config = load_country_config("tst", base_dir=tmp_path)
        assert isinstance(config, CountryConfig)
        assert config.country_code == "TST"
        assert config.return_periods["FL"] == (2, 5, 10)


class TestLoadErrors:
    def test_missing_file_raises_country_config_error(self, tmp_path: Path) -> None:
        with pytest.raises(CountryConfigError, match="not found"):
            load_country_config("MIA", base_dir=tmp_path)

    def test_empty_country_code_raises(self) -> None:
        with pytest.raises(CountryConfigError, match="non-empty"):
            load_country_config("")

    def test_invalid_json_raises(self, tmp_path: Path) -> None:
        _write(tmp_path, "TST", "{not valid json")
        with pytest.raises(CountryConfigError, match="not valid JSON"):
            load_country_config("TST", base_dir=tmp_path)

    def test_top_level_array_raises(self, tmp_path: Path) -> None:
        _write(tmp_path, "TST", [1, 2, 3])
        with pytest.raises(CountryConfigError, match="must be a JSON object"):
            load_country_config("TST", base_dir=tmp_path)

    @pytest.mark.parametrize(
        "missing_key",
        [
            "config_version",
            "country_code",
            "country_name",
            "discount_rate",
            "annual_growth_rate",
            "return_periods",
            "source_references",
        ],
    )
    def test_missing_required_key_raises(self, tmp_path: Path, missing_key: str) -> None:
        payload = _valid_config_payload()
        payload.pop(missing_key)
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="missing required key"):
            load_country_config("TST", base_dir=tmp_path)

    def test_non_integer_config_version_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["config_version"] = "1"
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="config_version"):
            load_country_config("TST", base_dir=tmp_path)

    def test_string_discount_rate_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["discount_rate"] = "0.05"
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="discount_rate"):
            load_country_config("TST", base_dir=tmp_path)

    def test_non_numeric_growth_rate_value_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["annual_growth_rate"]["crops"] = "fast"
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="annual_growth_rate.crops"):
            load_country_config("TST", base_dir=tmp_path)

    def test_empty_return_periods_list_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["return_periods"]["FL"] = []
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="return_periods.FL"):
            load_country_config("TST", base_dir=tmp_path)

    def test_negative_return_period_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["return_periods"]["FL"] = [10, -5]
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="non-positive-integer"):
            load_country_config("TST", base_dir=tmp_path)

    def test_source_references_not_list_of_strings_raises(self, tmp_path: Path) -> None:
        payload = _valid_config_payload()
        payload["source_references"] = ["ok", 42]
        _write(tmp_path, "TST", payload)
        with pytest.raises(CountryConfigError, match="source_references"):
            load_country_config("TST", base_dir=tmp_path)
