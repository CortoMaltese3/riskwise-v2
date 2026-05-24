"""Misc settings, health, cache, countries, data validation, and impact-function routes."""

from __future__ import annotations

import asyncio
from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from backend.api._envelope import _status_ok
from backend.cli import StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.logging_config import get_logger
from backend.models import (
    CountriesResponse,
    DataValidateRequest,
    DataValidateResponse,
    HealthResponse,
    ImpactFunctionResponse,
    ImpactFunctionValidateRequest,
    ImpactFunctionValidateResponse,
    TempClearResponse,
    UpdateUserSettingsRequest,
    UserSettingsResponse,
)
from backend.utils.country import sanitize_country_name
from backend.utils.data_check import check_data_type

router = APIRouter()
logger = get_logger("backend.api.settings")


def _check_data_type_sync(country: str, data_type: str) -> dict:
    country = sanitize_country_name(country)
    is_valid = check_data_type(country, data_type)
    if not is_valid:
        message = f"No datasets available for {data_type} in {country} in CLIMADA's API."
        code = StatusCode.VALIDATION_ERROR
    else:
        message = f"Fetched {data_type} data successfully."
        code = StatusCode.SUCCESS
    return {"data": {"data": {}}, "status": {"code": code, "message": message}}


def _clear_temp_dir_sync() -> dict:
    try:
        for file in DATA_TEMP_DIR.glob("*"):
            file.unlink(missing_ok=True)
        message = "Successfully cleared all files in the temporary directory."
        logger.info(message)
        return {"success": True, "message": message}
    except OSError as exc:
        error_message = f"Error while trying to clear temp directory. More info: {exc}"
        logger.error(error_message)
        return {"success": False, "error": error_message}


@router.get("/health", response_model=HealthResponse)
async def health() -> dict:
    return {"status": "ok"}


@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings_endpoint() -> dict:
    from backend.db import get_user_settings

    row = await asyncio.to_thread(get_user_settings)
    return {"data": asdict(row), "status": _status_ok()}


@router.patch("/settings", response_model=UserSettingsResponse)
async def patch_settings_endpoint(payload: UpdateUserSettingsRequest) -> dict:
    from backend.db import update_user_settings

    # ``model_fields_set`` lets us distinguish "the client omitted this key"
    # from "the client explicitly sent null"; the store treats _UNSET as
    # "leave column untouched" so a PATCH that only touches the locale never
    # blanks the currency (mirrors the snapshot title/caption pattern in #350).
    kwargs: dict = {}
    if "report_locale" in payload.model_fields_set and payload.report_locale is not None:
        kwargs["report_locale"] = payload.report_locale
    if "report_currency" in payload.model_fields_set and payload.report_currency is not None:
        kwargs["report_currency"] = payload.report_currency
    row = await asyncio.to_thread(update_user_settings, **kwargs)
    return {"data": asdict(row), "status": _status_ok()}


@router.post("/data/validate", response_model=DataValidateResponse)
async def data_validate(payload: DataValidateRequest) -> dict:
    return await asyncio.to_thread(_check_data_type_sync, payload.country, payload.dataType)


@router.get("/countries", response_model=CountriesResponse)
async def countries() -> dict:
    """Return the countries RISK WISE can run — built-in plus custom drop-ins.

    Each entry carries a ``source`` field (``"builtin"`` or ``"custom"``)
    so the frontend can label them distinctly (issue #56, Scenario 2).
    Invalid custom drop-ins are skipped at startup (see
    :func:`_scan_user_data_countries`) and do not appear here.
    """
    from backend.extensibility.registry import get_registry as get_country_registry

    registry = get_country_registry()
    data = [
        {"code": entry.code, "name": entry.name, "source": entry.source.value}
        for entry in registry.countries
    ]
    return {"data": data, "status": {"code": 2000, "message": "ok"}}


@router.post("/temp/clear", response_model=TempClearResponse)
async def temp_clear() -> dict:
    return await asyncio.to_thread(_clear_temp_dir_sync)


@router.post("/cache/clear")
async def cache_clear() -> dict:
    """Admin-only reset for the Entity/Hazard LRU and DuckDB computation cache.

    Not surfaced in the UI: intended for support flows that need a
    guaranteed cold repeat of a scenario (e.g. when validating a fix to
    a CLIMADA bug that an old cached result is masking).
    """
    from backend.cache import clear_all as _clear_object_caches
    from backend.db import cache_store

    await asyncio.to_thread(_clear_object_caches)
    await asyncio.to_thread(cache_store.clear)
    return {"data": {"cleared": True}, "status": _status_ok()}


@router.post("/impact-function/validate", response_model=ImpactFunctionValidateResponse)
async def impact_function_validate(payload: ImpactFunctionValidateRequest) -> dict:
    """Validate a user-edited impact function against the registry's rules.

    Returns a 200 with ``data.valid`` either way: the editor uses the
    ``errors`` array to highlight offending inputs inline. Calling this
    before a run is purely advisory — ``POST /scenario/run`` re-runs the
    same validator so a stale UI cannot push an invalid curve through.
    """
    from backend.impact.validator import validate_impact_function_override

    errors = validate_impact_function_override(payload.model_dump())
    return {
        "data": {
            "valid": not errors,
            "errors": [{"field": e.field, "code": e.code, "message": e.message} for e in errors],
        },
        "status": _status_ok(),
    }


@router.get("/impact-function", response_model=ImpactFunctionResponse)
async def impact_function_endpoint(
    country: str = "",
    hazard: str = "",
    exposure: str = "",
    entityFile: str | None = None,
) -> dict:
    """Return the impact-function spec the engine would apply for this selection.

    Read-only viewer backing the Risk-input Impact Function panel (issue #452).
    The spec is parsed from the same entity XLSX the scenario runner consumes
    so the viewer cannot drift from the engine's resolution. ``entityFile``
    overrides canonical-filename derivation for custom-mode uploads.
    """
    if not country or not hazard or not exposure:
        raise HTTPException(status_code=400, detail="country, hazard, and exposure are required")
    # Deferred import — the resolver pulls in openpyxl via the entity loader,
    # and tests for unrelated endpoints should not pay that import cost.
    from backend.impact.resolver import get_active_impact_function

    spec = await asyncio.to_thread(
        get_active_impact_function, country, hazard, exposure, entityFile
    )
    return {
        "data": {
            "id": spec.id,
            "name": spec.name,
            "haz_type": spec.haz_type,
            "exp_type": spec.exp_type,
            "intensity_unit": spec.intensity_unit,
            "intensity": list(spec.intensity),
            "mdd": list(spec.mdd),
            "paa": list(spec.paa),
        },
        "status": _status_ok(),
    }
