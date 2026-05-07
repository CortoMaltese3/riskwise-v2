"""Integration tests for the snapshot capture endpoints (#303)."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _provenance(seed: int = 42) -> dict:
    return {
        "app_version": "2.0.0-test",
        "engine_version": "test",
        "climada_version": "6.1.0",
        "entity_data_sha256": "0" * 64,
        "hazard_data_sha256": "0" * 64,
        "country_config_sha256": "0" * 64,
        "config_version": "test",
        "random_seed": seed,
    }


def _seed_scenario(scenario_id: str = "scen-1", saved: bool = False) -> None:
    from backend.db import insert_scenario

    insert_scenario(
        scenario_id,
        {
            "country": "Egypt",
            "hazard_type": "flood",
            "scenario": "rcp85",
            "exposure_economic": "assets",
            "exposure_non_economic": "",
            "ref_year": 2024,
            "future_year": 2050,
            "annual_growth": 0.02,
            "is_era": False,
            "app_option": "era",
        },
        results={},
        provenance=_provenance(),
        name="EGY flood",
        saved=saved,
    )


def test_post_snapshot_promotes_saved_and_round_trips(api_client: TestClient) -> None:
    _seed_scenario(saved=False)

    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
        "caption": "first capture",
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    snap = body["data"]
    assert snap["scenario_id"] == "scen-1"
    assert snap["snapshot_type"] == "map"
    assert snap["caption"] == "first capture"

    # Save promotion (#302): the previously-unsaved row must now show up
    # in the workspace list.
    listed = api_client.get("/api/v1/scenarios").json()
    assert any(item["id"] == "scen-1" for item in listed["data"])
    saved_row = next(item for item in listed["data"] if item["id"] == "scen-1")
    assert saved_row["saved"] is True

    # Image is reachable verbatim through the dedicated GET.
    image_response = api_client.get(f"/api/v1/snapshots/{snap['id']}/image")
    assert image_response.status_code == 200
    assert image_response.headers["content-type"].startswith("image/png")
    assert image_response.content == _PNG

    # PATCH updates caption and returns the new value.
    patch_response = api_client.patch(
        f"/api/v1/snapshots/{snap['id']}", json={"caption": "renamed"}
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["caption"] == "renamed"

    # Listing reflects the rename and the snapshot row is present.
    listing = api_client.get("/api/v1/scenarios/scen-1/snapshots").json()
    assert listing["data"][0]["caption"] == "renamed"

    # DELETE clears it.
    delete_response = api_client.delete(f"/api/v1/snapshots/{snap['id']}")
    assert delete_response.status_code == 200
    after = api_client.get("/api/v1/scenarios/scen-1/snapshots").json()
    assert after["data"] == []


def test_post_snapshot_unknown_scenario_returns_404(api_client: TestClient) -> None:
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
    }
    response = api_client.post("/api/v1/scenarios/missing/snapshots", json=payload)
    assert response.status_code == 404


def test_post_snapshot_rejects_oversized_image(api_client: TestClient) -> None:
    _seed_scenario(saved=True)
    big = b"\x00" * (10 * 1024 * 1024 + 1)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(big).decode("ascii"),
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 413


def test_post_snapshot_rejects_malformed_base64(api_client: TestClient) -> None:
    _seed_scenario(saved=True)
    payload = {"snapshot_type": "map", "image_base64": "not-valid-base64!!!"}
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 400


def test_get_unknown_snapshot_image_returns_404(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/snapshots/does-not-exist/image")
    assert response.status_code == 404


def test_patch_unknown_snapshot_returns_404(api_client: TestClient) -> None:
    response = api_client.patch("/api/v1/snapshots/missing", json={"caption": "x"})
    assert response.status_code == 404
