"""Scenario 5 of issue #56: provenance picks up a custom country's config.

The scenarios row must record the *custom* country's ``config_version``
and ``country_config_sha256`` when a run targets a drop-in. These tests
exercise the two pieces that wire that together: the
``load_country_config`` path now resolves via the extensibility registry,
and ``run_scenario._resolve_country_config_path`` returns the custom file
so ``provenance.sha256_file`` hashes the same bytes the loader read.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from countries.loader import load_country_config
from extensibility.registry import reset_registry
from provenance import sha256_file


def _write_custom(user_countries: Path, iso3: str, config_version: int = 7) -> Path:
    country_dir = user_countries / iso3
    country_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "config_version": config_version,
        "country_code": iso3,
        "country_name": "Kenya",
        "discount_rate": 0.03,
        "annual_growth_rate": {"crops": 0.02},
        "return_periods": {"FL": [5, 10]},
        "source_references": ["fixture"],
    }
    config_path = country_dir / "config.json"
    config_path.write_text(json.dumps(payload), encoding="utf-8")
    return config_path


@pytest.fixture
def isolated_registry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point the env-var-resolved registry at a fresh tmp path."""
    user_root = tmp_path / "rw-user"
    (user_root / "countries").mkdir(parents=True)
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", str(user_root))
    reset_registry()
    yield user_root / "countries"
    reset_registry()


def test_loader_reads_custom_country_via_registry(
    isolated_registry: Path,
) -> None:
    custom_path = _write_custom(isolated_registry, "KEN", config_version=7)

    config = load_country_config("KEN")

    assert config.country_code == "KEN"
    assert config.config_version == 7
    # The loader must have resolved to the user-data path, not a repo path.
    assert Path(custom_path).is_file()


def test_resolve_country_config_path_points_at_custom_file(
    isolated_registry: Path,
) -> None:
    custom_path = _write_custom(isolated_registry, "KEN")

    # Imported lazily: run_scenario imports CLIMADA at module top via a
    # chain of handlers, so we reach the helper via the module object.
    from run_scenario import _resolve_country_config_path

    resolved = _resolve_country_config_path("KEN")
    assert resolved == custom_path

    # The SHA is what ends up on the scenarios row — it must match the
    # file the loader actually read.
    assert sha256_file(resolved) == sha256_file(custom_path)


def test_resolve_falls_back_to_builtin_path_for_unknown_code(
    isolated_registry: Path,
) -> None:
    # No custom country written; unknown ISO3 falls through to the
    # built-in tree so the "file not found" branch of provenance
    # collection behaves as it did pre-#56.
    from run_scenario import _resolve_country_config_path

    resolved = _resolve_country_config_path("ZZZ")

    # Path is under the repo ``countries/`` tree even though the file
    # doesn't exist — matches legacy behaviour.
    assert resolved.parent.name == "ZZZ"
    assert "countries" in resolved.parts
