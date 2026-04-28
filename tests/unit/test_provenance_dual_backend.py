"""Dual-backend provenance population (#162).

The compute swap leaves exactly one of ``engine_version`` and
``climada_version`` populated on a fresh row, picked by whichever
backend the scenario actually ran under. This test pins both legs.
"""

from __future__ import annotations

import pytest
from provenance import collect


@pytest.fixture(autouse=True)
def _stub_climada_version(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the CLIMADA version so the assertion does not chase a moving target.

    The real ``climada_version()`` reads the installed package, which can
    drift if dependencies are bumped. Stubbing it isolates this test from
    the dependency pin and keeps the failure mode focused on the
    backend-selection logic itself.
    """
    monkeypatch.setattr("provenance.climada_version", lambda: "6.1.0")


def _collect(monkeypatch: pytest.MonkeyPatch, backend: str) -> dict:
    monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", backend)
    record = collect(
        entity_path=None,
        hazard_path=None,
        country_config_path=None,
        config_version_value="0",
        random_seed=42,
    )
    return record.as_dict()


def test_engine_backend_populates_engine_version_only(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _collect(monkeypatch, "engine")

    assert payload["engine"] == "engine"
    assert payload["engine_version"], "engine_version must be filled when backend == 'engine'"
    assert payload["climada_version"] is None


def test_climada_backend_populates_climada_version_only(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _collect(monkeypatch, "climada")

    assert payload["engine"] == "climada"
    assert payload["engine_version"] is None
    assert payload["climada_version"] == "6.1.0"


def test_default_backend_is_climada(monkeypatch: pytest.MonkeyPatch) -> None:
    """Until #164 flips the default, an unset env var means CLIMADA."""
    monkeypatch.delenv("RISKWISE_ENGINE_BACKEND", raising=False)
    record = collect(
        entity_path=None,
        hazard_path=None,
        country_config_path=None,
        config_version_value="0",
        random_seed=1,
    )
    payload = record.as_dict()

    assert payload["engine"] == "climada"
    assert payload["engine_version"] is None
    assert payload["climada_version"] == "6.1.0"
