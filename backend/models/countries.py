"""Country enumeration models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from backend.models.common import Status


class Country(BaseModel):
    code: str
    name: str
    # Phase-2 extensibility (issue #56): distinguishes shipped countries
    # from user-data drop-ins so the frontend can label them visibly.
    source: Literal["builtin", "custom"] = "builtin"


CountriesData = list[Country]


class CountriesResponse(BaseModel):
    data: CountriesData
    status: Status
