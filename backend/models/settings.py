"""Pydantic models for the user-settings endpoint (#351).

The allowlists below mirror the dropdowns rendered by
``src/components/settings/ReportFormattingSection.jsx``. Keep the two in sync:
adding a value here without exposing it in the UI silently broadens what
``PATCH /api/v1/settings`` accepts, and adding one in the UI without listing
it here trips the 422 validator.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from backend.models.common import Status

ReportLocale = Literal["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "th-TH", "ar-EG"]
ReportCurrency = Literal["EUR", "USD", "GBP", "CHF", "THB", "EGP"]


class UserSettings(BaseModel):
    report_locale: ReportLocale = Field(default="en-US")
    report_currency: ReportCurrency = Field(default="EUR")


class UpdateUserSettingsRequest(BaseModel):
    # ``None`` defaults plus ``model_fields_set`` at the handler level let a
    # caller PATCH just one field without resetting the other — same partial-
    # update contract as ``UpdateSnapshotRequest`` (#350).
    report_locale: ReportLocale | None = Field(default=None)
    report_currency: ReportCurrency | None = Field(default=None)


class UserSettingsResponse(BaseModel):
    data: UserSettings
    status: Status
