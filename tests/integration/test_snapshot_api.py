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
            "exposure_type": "assets",
            "asset_type": "economic",
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


def test_post_snapshot_persists_title_alongside_caption(api_client: TestClient) -> None:
    # #350: the title is independent of the caption and round-trips through the
    # create endpoint, the list endpoint, and the GET snapshots route.
    _seed_scenario(saved=True)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
        "title": "Figure 2: 2050 risk map",
        "caption": "Egypt — flood under rcp85",
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 200, response.text
    snap = response.json()["data"]
    assert snap["title"] == "Figure 2: 2050 risk map"
    assert snap["caption"] == "Egypt — flood under rcp85"

    listing = api_client.get("/api/v1/scenarios/scen-1/snapshots").json()
    assert listing["data"][0]["title"] == "Figure 2: 2050 risk map"
    assert listing["data"][0]["caption"] == "Egypt — flood under rcp85"


def test_patch_snapshot_updates_title_caption_and_both_independently(
    api_client: TestClient,
) -> None:
    # The PATCH endpoint must update title-only, caption-only, or both — and
    # an absent key in the request body must leave the existing column
    # untouched (so editing the title from the drawer does not blank the
    # caption, and vice versa).
    _seed_scenario(saved=True)
    create = api_client.post(
        "/api/v1/scenarios/scen-1/snapshots",
        json={
            "snapshot_type": "map",
            "image_base64": base64.b64encode(_PNG).decode("ascii"),
            "title": "initial title",
            "caption": "initial caption",
        },
    )
    snap_id = create.json()["data"]["id"]

    # Title-only PATCH preserves the caption.
    only_title = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"title": "renamed title"})
    assert only_title.status_code == 200
    data = only_title.json()["data"]
    assert data["title"] == "renamed title"
    assert data["caption"] == "initial caption"

    # Caption-only PATCH preserves the title.
    only_caption = api_client.patch(
        f"/api/v1/snapshots/{snap_id}", json={"caption": "renamed caption"}
    )
    assert only_caption.status_code == 200
    data = only_caption.json()["data"]
    assert data["title"] == "renamed title"
    assert data["caption"] == "renamed caption"

    # Both at once.
    both = api_client.patch(
        f"/api/v1/snapshots/{snap_id}",
        json={"title": "final title", "caption": "final caption"},
    )
    assert both.status_code == 200
    data = both.json()["data"]
    assert data["title"] == "final title"
    assert data["caption"] == "final caption"

    # Explicit null on title only clears that one column.
    cleared = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"title": None})
    assert cleared.status_code == 200
    data = cleared.json()["data"]
    assert data["title"] is None
    assert data["caption"] == "final caption"


def test_post_snapshot_rejects_title_over_120_chars(api_client: TestClient) -> None:
    # Pydantic ``max_length=120`` is enforced at the boundary so the column
    # can stay a thin ``VARCHAR`` without a separate CHECK constraint.
    _seed_scenario(saved=True)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
        "title": "x" * 121,
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 422


def test_post_snapshot_persists_surface_and_lists_it(api_client: TestClient) -> None:
    # #362: ``surface`` flows through the create/list endpoints so the PDF
    # report can route each captured snapshot into the right per-domain
    # section. Omitting the field round-trips as null (uncategorized).
    _seed_scenario(saved=True)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
        "surface": "exposure",
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 200, response.text
    snap = response.json()["data"]
    assert snap["surface"] == "exposure"

    listing = api_client.get("/api/v1/scenarios/scen-1/snapshots").json()
    assert listing["data"][0]["surface"] == "exposure"


def test_post_snapshot_without_surface_defaults_to_null(api_client: TestClient) -> None:
    _seed_scenario(saved=True)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 200
    assert response.json()["data"]["surface"] is None


def test_post_snapshot_rejects_invalid_surface(api_client: TestClient) -> None:
    # The ``Literal`` validator in ``SnapshotSurface`` is the boundary check
    # for the four allowed domains — anything else trips a 422 before the
    # store is touched.
    _seed_scenario(saved=True)
    payload = {
        "snapshot_type": "map",
        "image_base64": base64.b64encode(_PNG).decode("ascii"),
        "surface": "not-a-domain",
    }
    response = api_client.post("/api/v1/scenarios/scen-1/snapshots", json=payload)
    assert response.status_code == 422


def test_patch_snapshot_updates_each_field_independently(api_client: TestClient) -> None:
    # PATCH on title, caption, surface, or any combination must update
    # only the keys present in the body — omitting one leaves its column
    # untouched (#362, extends the title/caption guarantee from #350).
    _seed_scenario(saved=True)
    create = api_client.post(
        "/api/v1/scenarios/scen-1/snapshots",
        json={
            "snapshot_type": "map",
            "image_base64": base64.b64encode(_PNG).decode("ascii"),
            "title": "initial title",
            "caption": "initial caption",
            "surface": "hazard",
        },
    )
    snap_id = create.json()["data"]["id"]

    # Surface-only PATCH preserves title and caption.
    only_surface = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"surface": "impact"})
    assert only_surface.status_code == 200
    data = only_surface.json()["data"]
    assert data["surface"] == "impact"
    assert data["title"] == "initial title"
    assert data["caption"] == "initial caption"

    # Title-only PATCH leaves the new surface alone.
    only_title = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"title": "renamed"})
    assert only_title.status_code == 200
    data = only_title.json()["data"]
    assert data["title"] == "renamed"
    assert data["surface"] == "impact"

    # Caption-only PATCH leaves both surface and title alone.
    only_caption = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"caption": "new caption"})
    assert only_caption.status_code == 200
    data = only_caption.json()["data"]
    assert data["caption"] == "new caption"
    assert data["title"] == "renamed"
    assert data["surface"] == "impact"

    # Updating multiple fields at once still respects each value.
    multi = api_client.patch(
        f"/api/v1/snapshots/{snap_id}",
        json={
            "title": "final title",
            "caption": "final caption",
            "surface": "adaptation",
        },
    )
    assert multi.status_code == 200
    data = multi.json()["data"]
    assert data["title"] == "final title"
    assert data["caption"] == "final caption"
    assert data["surface"] == "adaptation"

    # Explicit null on surface only clears that one column.
    cleared = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"surface": None})
    assert cleared.status_code == 200
    data = cleared.json()["data"]
    assert data["surface"] is None
    assert data["title"] == "final title"
    assert data["caption"] == "final caption"


def test_patch_snapshot_rejects_invalid_surface(api_client: TestClient) -> None:
    _seed_scenario(saved=True)
    create = api_client.post(
        "/api/v1/scenarios/scen-1/snapshots",
        json={
            "snapshot_type": "map",
            "image_base64": base64.b64encode(_PNG).decode("ascii"),
        },
    )
    snap_id = create.json()["data"]["id"]
    response = api_client.patch(f"/api/v1/snapshots/{snap_id}", json={"surface": "garbage"})
    assert response.status_code == 422
