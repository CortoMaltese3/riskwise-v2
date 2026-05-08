"""Scenario run models — request body, job-acceptance, and SSE events.

The scenario runner ultimately returns a ``StatusEnvelope[dict]`` payload, but
that body is delivered over an SSE ``result`` event rather than the HTTP
response, so it is not modelled as an endpoint response.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.models.common import StatusEnvelope


class ScenarioRunRequest(BaseModel):
    """Inputs the renderer collects before kicking off a scenario run.

    The CLIMADA layer reads these as plain strings/ints; we keep the model
    permissive so users can submit only the subset of fields a given hazard or
    exposure flow actually needs.
    """

    model_config = ConfigDict(extra="allow")

    annualGrowth: float | int | None = None
    countryName: str | None = None
    exposureType: str | None = None
    assetType: Literal["economic", "non_economic"] | None = None
    exposureFile: str | None = None
    hazardType: str | None = None
    hazardFile: str | None = None
    isEra: bool | None = None
    scenario: str | None = None
    timeHorizon: list[int] | None = None


class JobAcceptedResponse(BaseModel):
    job_id: str = Field(..., description="UUID for the long-running scenario job")


class ScenarioProgressEvent(BaseModel):
    type: Literal["progress"]
    progress: int
    message: str = ""


class ScenarioResultEvent(BaseModel):
    type: Literal["result"]
    data: StatusEnvelope[dict]


class ScenarioErrorEvent(BaseModel):
    type: Literal["error"]
    error: str
