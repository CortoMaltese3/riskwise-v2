"""Country enumeration models."""

from __future__ import annotations

from models.common import Status
from pydantic import BaseModel


class Country(BaseModel):
    code: str
    name: str


CountriesData = list[Country]


class CountriesResponse(BaseModel):
    data: CountriesData
    status: Status
