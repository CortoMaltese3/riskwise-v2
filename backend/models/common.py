"""Shared envelope types used by every business endpoint."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class Status(BaseModel):
    code: int
    message: str = ""


class StatusEnvelope(BaseModel, Generic[DataT]):
    data: DataT
    status: Status
