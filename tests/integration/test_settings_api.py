"""Integration tests for the user-settings endpoints (#351)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_get_settings_returns_defaults_on_first_call(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/settings")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["report_locale"] == "en-US"
    assert body["data"]["report_currency"] == "EUR"


def test_patch_settings_round_trips_both_fields(api_client: TestClient) -> None:
    patched = api_client.patch(
        "/api/v1/settings",
        json={"report_locale": "de-DE", "report_currency": "USD"},
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["data"]["report_locale"] == "de-DE"
    assert body["data"]["report_currency"] == "USD"

    reread = api_client.get("/api/v1/settings").json()
    assert reread["data"]["report_locale"] == "de-DE"
    assert reread["data"]["report_currency"] == "USD"


def test_patch_settings_only_locale_preserves_currency(api_client: TestClient) -> None:
    # Seed both fields to non-defaults so we can prove the partial PATCH
    # leaves the omitted column alone (the same contract enforced for
    # snapshot title/caption in #350).
    api_client.patch(
        "/api/v1/settings",
        json={"report_locale": "fr-FR", "report_currency": "CHF"},
    )

    only_locale = api_client.patch("/api/v1/settings", json={"report_locale": "es-ES"})
    assert only_locale.status_code == 200
    data = only_locale.json()["data"]
    assert data["report_locale"] == "es-ES"
    assert data["report_currency"] == "CHF"


def test_patch_settings_only_currency_preserves_locale(api_client: TestClient) -> None:
    api_client.patch(
        "/api/v1/settings",
        json={"report_locale": "th-TH", "report_currency": "EGP"},
    )

    only_currency = api_client.patch("/api/v1/settings", json={"report_currency": "GBP"})
    assert only_currency.status_code == 200
    data = only_currency.json()["data"]
    assert data["report_locale"] == "th-TH"
    assert data["report_currency"] == "GBP"


def test_patch_settings_rejects_unknown_locale(api_client: TestClient) -> None:
    response = api_client.patch("/api/v1/settings", json={"report_locale": "xx-XX"})
    assert response.status_code == 422


def test_patch_settings_rejects_unknown_currency(api_client: TestClient) -> None:
    response = api_client.patch("/api/v1/settings", json={"report_currency": "ZZZ"})
    assert response.status_code == 422


def test_patch_settings_empty_body_returns_current_settings(api_client: TestClient) -> None:
    # Idempotent no-op: an empty PATCH must not blank the row.
    api_client.patch(
        "/api/v1/settings",
        json={"report_locale": "ar-EG", "report_currency": "EGP"},
    )
    response = api_client.patch("/api/v1/settings", json={})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["report_locale"] == "ar-EG"
    assert data["report_currency"] == "EGP"
