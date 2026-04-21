"""Tests for the Settings > Custom Data ZIP validate/import flow (issue #90).

Covers the acceptance criteria attached to the endpoint pytest list:

* A well-formed country pack validates clean.
* A pack missing ``countries/<ISO3>/config.json`` reports an actionable error.
* A pack with malformed JSON in ``config.json`` is rejected with the validator
  error (not a generic 500).
* An import-then-list-then-delete cycle leaves no residue under ``user-data``.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest
from custom_data_handler import (
    CustomDataError,
    delete_custom_country,
    import_pack,
    list_custom_countries,
    validate_pack,
)
from extensibility.registry import reset_registry
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the user-data scanner at a throwaway directory for every test."""
    user_data = tmp_path / "user-data"
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", str(user_data))
    reset_registry()
    yield user_data
    reset_registry()


def _valid_config(iso3: str = "KEN", name: str = "Kenya") -> dict:
    return {
        "config_version": 1,
        "country_code": iso3,
        "country_name": name,
        "discount_rate": 0.05,
        "annual_growth_rate": {"crops": 0.02},
        "return_periods": {"FL": [2, 5, 10]},
        "source_references": ["discount_rate 5% — fixture"],
    }


def _valid_impact_functions() -> list[dict]:
    return [
        {
            "haz_type": "FL",
            "exp_type": "crops",
            "id": 201,
            "name": "Fixture crops",
            "intensity_unit": "m",
            "intensity": [0.0, 1.0, 2.0],
            "mdd": [0.0, 0.3, 0.6],
            "paa": [1.0, 1.0, 1.0],
        }
    ]


def _build_zip(
    tmp_path: Path,
    *,
    iso3: str = "KEN",
    config: dict | str | None = None,
    impact: list[dict] | str | None = None,
    include_config: bool = True,
    extra_paths: dict[str, bytes] | None = None,
    filename: str = "pack.zip",
) -> Path:
    """Assemble a ZIP at ``tmp_path/filename`` mimicking a country pack."""
    zip_path = tmp_path / filename
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if include_config:
            raw_config = (
                config
                if isinstance(config, str)
                else json.dumps(config if config is not None else _valid_config(iso3))
            )
            zf.writestr(f"countries/{iso3}/config.json", raw_config)
        if impact is not None:
            raw_impact = impact if isinstance(impact, str) else json.dumps(impact)
            zf.writestr(f"countries/{iso3}/impact_functions.json", raw_impact)
        for path, payload in (extra_paths or {}).items():
            zf.writestr(path, payload)
    return zip_path


class TestValidatePack:
    def test_valid_pack_is_accepted(self, tmp_path: Path) -> None:
        zip_path = _build_zip(tmp_path, impact=_valid_impact_functions())

        result = validate_pack(zip_path)

        assert result["valid"] is True
        assert result["errors"] == []
        assert result["iso3"] == "KEN"
        assert result["country_name"] == "Kenya"

    def test_missing_config_is_reported(self, tmp_path: Path) -> None:
        zip_path = _build_zip(
            tmp_path,
            include_config=False,
            extra_paths={"countries/KEN/impact_functions.json": b"[]"},
        )

        result = validate_pack(zip_path)

        assert result["valid"] is False
        assert any("config.json" in err for err in result["errors"])
        assert result["iso3"] == ""

    def test_bad_json_surfaces_validator_error(self, tmp_path: Path) -> None:
        zip_path = _build_zip(tmp_path, config="{not json")

        result = validate_pack(zip_path)

        assert result["valid"] is False
        assert result["iso3"] == "KEN"
        # The country loader's error message names the file + JSON problem.
        assert any("JSON" in err or "json" in err for err in result["errors"])

    def test_builtin_iso3_collision_is_rejected(self, tmp_path: Path) -> None:
        zip_path = _build_zip(tmp_path, iso3="EGY", config=_valid_config("EGY", "Egypt"))

        result = validate_pack(zip_path)

        assert result["valid"] is False
        assert any("reserved" in err or "built-in" in err for err in result["errors"])

    def test_archive_with_multiple_countries_is_rejected(self, tmp_path: Path) -> None:
        zip_path = tmp_path / "multi.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("countries/KEN/config.json", json.dumps(_valid_config("KEN", "Kenya")))
            zf.writestr("countries/UGA/config.json", json.dumps(_valid_config("UGA", "Uganda")))

        result = validate_pack(zip_path)

        assert result["valid"] is False
        assert any("multiple countries" in err for err in result["errors"])

    def test_bad_zip_is_rejected_not_raised(self, tmp_path: Path) -> None:
        bogus = tmp_path / "broken.zip"
        bogus.write_bytes(b"not a zip at all")

        result = validate_pack(bogus)

        assert result["valid"] is False
        assert any("ZIP" in err for err in result["errors"])

    def test_traversal_entry_is_rejected(self, tmp_path: Path) -> None:
        # A ZIP that tries to write outside the country dir via ``..`` is
        # ignored at layout-resolution time: the file never matches the
        # expected ``countries/<ISO3>/config.json`` shape.
        zip_path = tmp_path / "traverse.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("../../evil.txt", b"pwned")

        result = validate_pack(zip_path)

        assert result["valid"] is False


class TestImportAndList:
    def test_import_then_list_then_delete(
        self,
        tmp_path: Path,
        isolated_user_data: Path,
    ) -> None:
        zip_path = _build_zip(tmp_path, impact=_valid_impact_functions())

        info = import_pack(zip_path)
        assert info["iso3"] == "KEN"
        assert info["country_name"] == "Kenya"
        assert (isolated_user_data / "countries" / "KEN" / "config.json").is_file()
        assert (isolated_user_data / "countries" / "KEN" / "impact_functions.json").is_file()

        listed = list_custom_countries()
        assert len(listed) == 1
        assert listed[0]["iso3"] == "KEN"
        assert listed[0]["country_name"] == "Kenya"

        delete_custom_country("KEN")
        assert not (isolated_user_data / "countries" / "KEN").exists()
        assert list_custom_countries() == []

    def test_import_overwrites_existing_pack(
        self,
        tmp_path: Path,
        isolated_user_data: Path,
    ) -> None:
        first = _build_zip(tmp_path, filename="v1.zip")
        import_pack(first)

        second = _build_zip(
            tmp_path,
            filename="v2.zip",
            config=_valid_config("KEN", "Kenya (updated)"),
        )
        info = import_pack(second)

        assert info["country_name"] == "Kenya (updated)"
        config_path = isolated_user_data / "countries" / "KEN" / "config.json"
        assert "Kenya (updated)" in config_path.read_text(encoding="utf-8")

    def test_invalid_pack_import_raises(self, tmp_path: Path) -> None:
        broken = _build_zip(tmp_path, config="{not json")

        with pytest.raises(CustomDataError):
            import_pack(broken)

    def test_delete_unknown_country_raises(self) -> None:
        with pytest.raises(CustomDataError):
            delete_custom_country("ZZZ")

    def test_delete_builtin_country_rejected(self) -> None:
        with pytest.raises(CustomDataError):
            delete_custom_country("EGY")


class TestValidateEndpoint:
    """HTTP-level coverage for the endpoint the issue calls out explicitly."""

    @pytest.fixture
    def client(self) -> TestClient:
        from app import app

        return TestClient(app, raise_server_exceptions=False)

    def test_valid_zip_passes(self, tmp_path: Path, client: TestClient) -> None:
        zip_path = _build_zip(tmp_path)

        response = client.post(
            "/api/v1/custom-data/validate",
            json={"zip_path": str(zip_path)},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["valid"] is True
        assert body["data"]["iso3"] == "KEN"

    def test_missing_config_fails(self, tmp_path: Path, client: TestClient) -> None:
        zip_path = _build_zip(
            tmp_path,
            include_config=False,
            extra_paths={"countries/KEN/impact_functions.json": b"[]"},
        )

        response = client.post(
            "/api/v1/custom-data/validate",
            json={"zip_path": str(zip_path)},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["valid"] is False
        assert any("config.json" in e for e in body["data"]["errors"])

    def test_bad_json_fails(self, tmp_path: Path, client: TestClient) -> None:
        zip_path = _build_zip(tmp_path, config="{bad json")

        response = client.post(
            "/api/v1/custom-data/validate",
            json={"zip_path": str(zip_path)},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["valid"] is False
        assert body["data"]["iso3"] == "KEN"
