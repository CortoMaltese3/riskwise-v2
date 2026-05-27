"""Snapshot create/read/update/delete routes.

The create endpoint lives at ``/scenarios/{scenario_id}/snapshots`` because a
snapshot is always scoped to a scenario; the read/update/delete endpoints
key off the snapshot UUID directly under ``/snapshots/{snapshot_id}``.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.api._envelope import _status_ok
from backend.models import (
    CreateSnapshotRequest,
    CreateSnapshotResponse,
    DeleteSnapshotResponse,
    UpdateSnapshotRequest,
    UpdateSnapshotResponse,
)

router = APIRouter()

# Cap on a single uploaded snapshot. Native-resolution map screenshots and
# Chart.js exports are routinely <1 MiB; 10 MiB is a sanity guard that still
# absorbs an oversized retina capture without abusing the DB blob.
_SNAPSHOT_MAX_BYTES = 10 * 1024 * 1024


@router.post(
    "/scenarios/{scenario_id}/snapshots",
    response_model=CreateSnapshotResponse,
)
async def create_snapshot_endpoint(scenario_id: str, payload: CreateSnapshotRequest) -> dict:
    from backend.db import ScenarioNotFound, create_snapshot

    try:
        image_bytes = base64.b64decode(payload.image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"image_base64 invalid: {exc}") from exc
    if len(image_bytes) > _SNAPSHOT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="snapshot image exceeds 10 MiB")

    try:
        row = await asyncio.to_thread(
            create_snapshot,
            scenario_id=scenario_id,
            snapshot_type=payload.snapshot_type,
            image=image_bytes,
            title=payload.title,
            caption=payload.caption,
            surface=payload.surface,
        )
    except ScenarioNotFound as exc:
        raise HTTPException(status_code=404, detail="Scenario not found") from exc
    return {"data": asdict(row), "status": _status_ok()}


@router.get("/snapshots/{snapshot_id}/image")
async def get_snapshot_image_endpoint(snapshot_id: str):
    from backend.db import get_snapshot_image

    result = await asyncio.to_thread(get_snapshot_image, snapshot_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    image_bytes, mime = result
    return Response(content=image_bytes, media_type=mime)


@router.patch(
    "/snapshots/{snapshot_id}",
    response_model=UpdateSnapshotResponse,
)
async def update_snapshot_endpoint(snapshot_id: str, payload: UpdateSnapshotRequest) -> dict:
    from backend.db import update_snapshot

    # ``model_fields_set`` lets us distinguish "the client omitted this key"
    # from "the client explicitly sent null". Forwarding only the explicit
    # fields means a PATCH that touches only the title leaves the caption
    # untouched (and vice versa) — required by #350 for independent editing.
    kwargs: dict = {}
    if "title" in payload.model_fields_set:
        kwargs["title"] = payload.title
    if "caption" in payload.model_fields_set:
        kwargs["caption"] = payload.caption
    if "surface" in payload.model_fields_set:
        kwargs["surface"] = payload.surface
    row = await asyncio.to_thread(update_snapshot, snapshot_id, **kwargs)
    if row is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"data": asdict(row), "status": _status_ok()}


@router.delete("/snapshots/{snapshot_id}", response_model=DeleteSnapshotResponse)
async def delete_snapshot_endpoint(snapshot_id: str) -> dict:
    from backend.db import delete_snapshot

    removed = await asyncio.to_thread(delete_snapshot, snapshot_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"data": {"id": snapshot_id}, "status": _status_ok()}
