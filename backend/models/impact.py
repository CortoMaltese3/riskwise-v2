"""Pydantic models for the impact-function viewer + editor (issues #452, #453)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from backend.models.common import Status


class ImpactFunctionPayload(BaseModel):
    """The full curve plus metadata for one impact function."""

    id: int
    name: str
    haz_type: str
    exp_type: str
    intensity_unit: str
    intensity: list[float]
    mdd: list[float]
    paa: list[float]


class ImpactFunctionResponse(BaseModel):
    data: ImpactFunctionPayload
    status: Status


class ImpactFunctionValidateRequest(BaseModel):
    """Body for ``POST /api/v1/impact-function/validate`` (#453).

    The renderer posts the spec the user just edited; the server replies
    with structured per-field errors so the editor can highlight the
    offending inputs inline. ``extra="allow"`` keeps the boundary tolerant
    of stray client-only fields without compromising the validator's own
    required-field checks.
    """

    model_config = ConfigDict(extra="allow")

    id: int | None = None
    name: str | None = None
    haz_type: str | None = None
    exp_type: str | None = None
    intensity_unit: str | None = None
    intensity: list[float] | None = None
    mdd: list[float] | None = None
    paa: list[float] | None = None


class ImpactFunctionFieldError(BaseModel):
    """One validation failure as the editor sees it."""

    field: str
    code: str
    message: str


class ImpactFunctionValidateData(BaseModel):
    """Validation result envelope: ``valid`` + the field-error list."""

    valid: bool
    errors: list[ImpactFunctionFieldError]


class ImpactFunctionValidateResponse(BaseModel):
    data: ImpactFunctionValidateData
    status: Status
