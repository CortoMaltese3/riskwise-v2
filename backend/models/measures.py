"""Adaptation measures models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.models.common import Status


class Measure(BaseModel):
    # Stable id used by the picker UI's React keys. Falls back to ``name``
    # when no catalog row matches (custom entity measure with no alias).
    id: str
    # The engine name — what ``MeasureSpec.name`` carries on the entity
    # workbook and what the runtime filter matches against. Stays the
    # source of truth for selection so the run pipeline keeps working.
    name: str
    # i18n key from the catalog (e.g. ``adaptation_measures_trees_planting``)
    # when the entity row joins to a catalog row by ``code`` or ``name``.
    # Null when the entity ships a measure absent from the catalog —
    # the renderer falls back to ``name``.
    displayName: str | None = None
    is_builtin: bool
    source_reference: str | None = None
    # Optional extra metadata from the catalog. Kept around for future
    # editor surfaces; the picker today only consumes the fields above.
    cost_factor: float | None = None
    hazard_reduction_percentage: float | None = None


class MeasuresData(BaseModel):
    # ``adaptationMeasures`` stays a flat list of names for backwards
    # compatibility with the scenario-run pipeline (which only needs names).
    adaptationMeasures: list[str]
    # ``measures`` carries the per-row metadata the picker renders
    # (display label, built-in/custom badge, source citation). The list
    # is sourced from the entity workbook with catalog enrichment so
    # every row is something the engine can actually run.
    measures: list[Measure] = Field(default_factory=list)


class MeasuresResponse(BaseModel):
    data: MeasuresData
    status: Status


class MeasureSet(BaseModel):
    id: str
    name: str
    uploaded_at: datetime
    is_builtin: bool
    sha256: str | None = None
    measure_count: int = 0
    countries: str | None = None
    hazards: str | None = None


class MeasureSetsResponse(BaseModel):
    data: list[MeasureSet]
    status: Status


class MeasureSetUploadRequest(BaseModel):
    """Payload for POST ``/api/v1/measures/datasets``.

    As with the CRED upload endpoint, the renderer passes the xlsx path on
    disk rather than multipart bytes — Electron and the backend share the
    user's filesystem, so streaming through the loopback channel is
    unnecessary overhead.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1)
    xlsx_path: str = Field(..., min_length=1)


class MeasureSetUploadResponse(BaseModel):
    data: MeasureSet
    status: Status


class MeasureSetDeleteData(BaseModel):
    id: str


class MeasureSetDeleteResponse(BaseModel):
    data: MeasureSetDeleteData
    status: Status
