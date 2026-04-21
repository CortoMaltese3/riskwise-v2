"""Validate, import, list, and delete custom country packs (issue #90).

The Settings > Custom Data panel in the Electron renderer drives this module.
Flow:

1. Analyst drops / browses to a ``.zip`` on disk.
2. ``validate_pack`` inspects the archive *without* touching user-data.
3. On confirm, ``import_pack`` extracts the pack into
   ``<user-data>/countries/<ISO3>/`` (the dir that the extensibility registry
   scans at startup — see ``backend/extensibility/``).
4. ``list_custom_countries`` / ``delete_custom_country`` maintain the list.

After a mutation we reset the cached :class:`CountryRegistry` so the rest of
the backend (``/api/v1/countries`` etc.) picks up the change without a
process restart.

Security
--------
``_safe_extract`` refuses archives containing absolute paths, traversal
segments (``..``), or entries that would escape the intended country
directory. A malformed ZIP thus cannot overwrite arbitrary files on the
analyst's machine — the pack is confined to
``<user-data>/countries/<ISO3>/``.
"""

from __future__ import annotations

import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from countries.loader import CountryConfigError, load_country_config
from extensibility.registry import BUILTIN_COUNTRY_CODES, reset_registry
from extensibility.user_data import get_user_data_countries_dir
from logging_config import get_logger

_log = get_logger("custom_data")

CONFIG_FILENAME = "config.json"
IMPACT_FUNCTIONS_FILENAME = "impact_functions.json"


class CustomDataError(RuntimeError):
    """Raised when an import/delete cannot proceed (bad ZIP, collision, IO)."""


def validate_pack(zip_path: Path) -> dict[str, object]:
    """Inspect a ``.zip`` without installing it.

    Returns a dict with keys ``valid``, ``errors``, ``country_name``, ``iso3``.
    The renderer uses ``errors`` to show an actionable error list rather than
    a generic "invalid ZIP" toast.
    """
    errors: list[str] = []
    country_name = ""
    iso3 = ""

    if not zip_path.is_file():
        return {
            "valid": False,
            "errors": [f"File not found: {zip_path}"],
            "country_name": "",
            "iso3": "",
        }

    try:
        archive = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        return {
            "valid": False,
            "errors": [f"Not a valid ZIP archive: {exc}"],
            "country_name": "",
            "iso3": "",
        }

    with archive as zf:
        try:
            iso3, config_member, impact_member = _resolve_layout(zf)
        except CustomDataError as exc:
            return {
                "valid": False,
                "errors": [str(exc)],
                "country_name": "",
                "iso3": "",
            }

        if iso3 in BUILTIN_COUNTRY_CODES:
            errors.append(
                f"ISO3 {iso3!r} is reserved for a built-in country and cannot be overridden. "
                f"Rename the directory inside the ZIP to a non-built-in code."
            )

        with tempfile.TemporaryDirectory(prefix="riskwise-custom-") as tmp_root:
            tmp_dir = Path(tmp_root)
            try:
                config_path = _extract_member(zf, config_member, tmp_dir)
                if impact_member is not None:
                    _extract_member(zf, impact_member, tmp_dir)
            except CustomDataError as exc:
                errors.append(str(exc))
                return {
                    "valid": False,
                    "errors": errors,
                    "country_name": "",
                    "iso3": iso3,
                }

            try:
                config = load_country_config(iso3, config_path=config_path)
                country_name = config.country_name
            except CountryConfigError as exc:
                errors.append(str(exc))

    return {
        "valid": not errors,
        "errors": errors,
        "country_name": country_name,
        "iso3": iso3,
    }


def import_pack(zip_path: Path) -> dict[str, str]:
    """Extract a validated pack into ``<user-data>/countries/<ISO3>/``."""
    result = validate_pack(zip_path)
    if not result["valid"]:
        errors = result["errors"] or ["Unknown validation error"]
        raise CustomDataError("; ".join(str(e) for e in errors))

    iso3 = str(result["iso3"])
    country_name = str(result["country_name"])

    user_countries_dir = get_user_data_countries_dir()
    if user_countries_dir is None:
        raise CustomDataError(
            "User-data scanning is disabled (RISKWISE_USER_DATA_DIR is empty); "
            "cannot install custom country."
        )

    user_countries_dir.mkdir(parents=True, exist_ok=True)
    target_dir = user_countries_dir / iso3

    if target_dir.exists():
        shutil.rmtree(target_dir)

    with zipfile.ZipFile(zip_path) as zf:
        iso3_resolved, config_member, impact_member = _resolve_layout(zf)
        target_dir.mkdir(parents=True, exist_ok=True)
        try:
            _extract_to(zf, config_member, target_dir / CONFIG_FILENAME)
            if impact_member is not None:
                _extract_to(zf, impact_member, target_dir / IMPACT_FUNCTIONS_FILENAME)
        except CustomDataError:
            shutil.rmtree(target_dir, ignore_errors=True)
            raise

    reset_registry()
    installed_at = datetime.now(UTC).isoformat(timespec="seconds")
    _log.info("custom_data.imported", iso3=iso3_resolved, path=str(target_dir))
    return {
        "iso3": iso3,
        "country_name": country_name,
        "installed_at": installed_at,
    }


def list_custom_countries() -> list[dict[str, str]]:
    """Return metadata for every installed custom country."""
    user_countries_dir = get_user_data_countries_dir()
    if user_countries_dir is None or not user_countries_dir.is_dir():
        return []

    entries: list[dict[str, str]] = []
    for child in sorted(user_countries_dir.iterdir()):
        if not child.is_dir():
            continue
        iso3 = child.name.upper()
        config_path = child / CONFIG_FILENAME
        if not config_path.is_file():
            continue
        try:
            config = load_country_config(iso3, config_path=config_path)
            country_name = config.country_name
        except CountryConfigError:
            country_name = iso3

        try:
            mtime = config_path.stat().st_mtime
            installed_at = datetime.fromtimestamp(mtime, tz=UTC).isoformat(timespec="seconds")
        except OSError:
            installed_at = ""

        entries.append(
            {
                "iso3": iso3,
                "country_name": country_name,
                "installed_at": installed_at,
                "source": "user-data",
            }
        )
    return entries


def delete_custom_country(iso3: str) -> None:
    """Remove a custom country directory and reset the registry cache."""
    if not iso3:
        raise CustomDataError("ISO3 code is required.")
    iso3_key = iso3.upper()
    if iso3_key in BUILTIN_COUNTRY_CODES:
        raise CustomDataError(f"ISO3 {iso3_key!r} is a built-in country and cannot be deleted.")

    user_countries_dir = get_user_data_countries_dir()
    if user_countries_dir is None or not user_countries_dir.is_dir():
        raise CustomDataError(f"Custom country {iso3_key!r} is not installed.")

    target = user_countries_dir / iso3_key
    if not target.is_dir():
        raise CustomDataError(f"Custom country {iso3_key!r} is not installed.")

    shutil.rmtree(target)
    reset_registry()
    _log.info("custom_data.deleted", iso3=iso3_key)


# --- internals ---------------------------------------------------------------


def _resolve_layout(zf: zipfile.ZipFile) -> tuple[str, zipfile.ZipInfo, zipfile.ZipInfo | None]:
    """Find the single ``countries/<ISO3>/config.json`` entry.

    Raises :class:`CustomDataError` if the archive is missing the directory,
    contains multiple countries, or has unsafe entries. Returns the uppercase
    ISO3, the config ZipInfo, and the optional impact-functions ZipInfo.
    """
    config_members: list[tuple[str, zipfile.ZipInfo]] = []
    impact_members: dict[str, zipfile.ZipInfo] = {}

    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = _normalised_parts(info.filename)
        if parts is None or len(parts) < 3:
            continue
        if parts[0].lower() != "countries":
            continue
        iso3 = parts[1].upper()
        leaf = parts[-1]
        if len(parts) == 3 and leaf == CONFIG_FILENAME:
            config_members.append((iso3, info))
        elif len(parts) == 3 and leaf == IMPACT_FUNCTIONS_FILENAME:
            impact_members[iso3] = info

    if not config_members:
        raise CustomDataError(
            f"Archive is missing countries/<ISO3>/{CONFIG_FILENAME}. "
            f"Expected layout: countries/<ISO3>/{CONFIG_FILENAME} "
            f"(+ optional {IMPACT_FUNCTIONS_FILENAME})."
        )
    if len({iso3 for iso3, _ in config_members}) > 1:
        codes = sorted({iso3 for iso3, _ in config_members})
        raise CustomDataError(
            f"Archive contains multiple countries ({', '.join(codes)}); "
            f"import one country pack at a time."
        )

    iso3, config_info = config_members[0]
    impact_info = impact_members.get(iso3)
    return iso3, config_info, impact_info


def _normalised_parts(name: str) -> tuple[str, ...] | None:
    """Return the ZIP entry's path parts, or ``None`` if the path is unsafe."""
    if not name:
        return None
    cleaned = name.replace("\\", "/")
    parts = tuple(p for p in cleaned.split("/") if p)
    if not parts:
        return None
    for part in parts:
        if part in ("..", "."):
            return None
        if part.startswith("/") or (len(part) >= 2 and part[1] == ":"):
            # Absolute path or Windows drive letter.
            return None
    return parts


def _extract_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo, tmp_dir: Path) -> Path:
    """Extract a single ZIP entry into ``tmp_dir``, preserving its relative path."""
    parts = _normalised_parts(info.filename)
    if parts is None:
        raise CustomDataError(f"Archive contains unsafe path: {info.filename!r}")
    target = tmp_dir.joinpath(*parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(info) as src, target.open("wb") as dst:
        shutil.copyfileobj(src, dst)
    return target


def _extract_to(zf: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path) -> None:
    """Extract a single ZIP entry to an exact target path."""
    parts = _normalised_parts(info.filename)
    if parts is None:
        raise CustomDataError(f"Archive contains unsafe path: {info.filename!r}")
    target.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(info) as src, target.open("wb") as dst:
        shutil.copyfileobj(src, dst)
