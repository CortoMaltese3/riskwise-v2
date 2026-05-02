"""Load per-country scientific constants from versioned JSON config files.

The ERA workflow reads discount rates, per-sector annual growth rates, and
per-hazard return periods from ``countries/<ISO3>/config.json`` instead of
inline literals in ``run_scenario.py``. Externalizing these values lets
analysts edit them without a code release and keeps the citations
(``source_references``) next to the numbers they justify.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class CountryConfigError(Exception):
    """Raised when a country config is missing, malformed, or fails validation."""


@dataclass(frozen=True)
class CountryConfig:
    """Validated, in-memory view of a ``countries/<ISO3>/config.json`` file."""

    config_version: int
    country_code: str
    country_name: str
    discount_rate: float
    annual_growth_rate: dict[str, float]
    return_periods: dict[str, tuple[int, ...]]
    source_references: tuple[str, ...]


_REQUIRED_KEYS: tuple[str, ...] = (
    "config_version",
    "country_code",
    "country_name",
    "discount_rate",
    "annual_growth_rate",
    "return_periods",
    "source_references",
)


def _default_root() -> Path:
    # Resolved through backend.constants so the lookup honours the
    # bundled-aware base dir (Path(sys.executable).parent under Nuitka /
    # PyInstaller) instead of a __file__-relative path that lands inside
    # the onefile temp tree.
    from backend.constants import COUNTRIES_DIR

    return COUNTRIES_DIR


def _resolve_config_path(iso3: str, base_dir: Path | None) -> Path:
    """Resolve the config.json path for ``iso3``.

    If ``base_dir`` is given, look there (the path the tests use to point
    at a ``tmp_path``). Otherwise ask the extensibility registry — that
    knows about both the shipped built-ins and any custom drop-ins under
    ``<user-data>/countries/``. A code unknown to the registry falls back
    to the built-in tree so the error message still names the expected
    path.
    """
    if base_dir is not None:
        return base_dir / iso3 / "config.json"

    # Deferred import to break the cycle: the extensibility registry
    # imports this module when it validates custom countries.
    from backend.extensibility.registry import get_registry

    entry = get_registry().get(iso3)
    if entry is not None:
        return entry.config_path
    return _default_root() / iso3 / "config.json"


def load_country_config(
    country_code: str,
    base_dir: Path | None = None,
    *,
    config_path: Path | None = None,
) -> CountryConfig:
    """Load and validate the country config for the given ISO3 code.

    :param country_code: ISO3 country code (case-insensitive).
    :param base_dir: Override the ``countries/`` root (used in tests). When
        omitted, the extensibility registry resolves built-in vs custom
        country locations automatically.
    :param config_path: Use this exact path instead of deriving one from
        ``base_dir``. Callers that already have the resolved path (e.g. the
        custom-country scanner) pass this to avoid case-sensitivity issues on
        Linux where the directory name may differ in case from the ISO3 code.
    :raises CountryConfigError: when the file is missing, unreadable,
        invalid JSON, or fails schema validation.
    """
    if not country_code:
        raise CountryConfigError("country_code must be a non-empty ISO3 string.")
    iso3 = country_code.upper()

    path = config_path if config_path is not None else _resolve_config_path(iso3, base_dir)

    if not path.is_file():
        raise CountryConfigError(
            f"Country config not found for ISO3 '{iso3}' at {path}. "
            f"Add countries/{iso3}/config.json or check the country code."
        )

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CountryConfigError(
            f"Country config for '{iso3}' at {path} is not valid JSON: {exc}"
        ) from exc

    return _parse(raw, iso3, path)


def _parse(raw: Any, iso3: str, path: Path) -> CountryConfig:
    if not isinstance(raw, dict):
        raise CountryConfigError(
            f"Country config for '{iso3}' at {path} must be a JSON object, "
            f"got {type(raw).__name__}."
        )

    missing = [k for k in _REQUIRED_KEYS if k not in raw]
    if missing:
        raise CountryConfigError(
            f"Country config for '{iso3}' at {path} is missing required key(s): "
            f"{', '.join(missing)}."
        )

    config_version = raw["config_version"]
    if not isinstance(config_version, int) or isinstance(config_version, bool):
        raise CountryConfigError(
            f"Country config for '{iso3}': 'config_version' must be an integer, "
            f"got {type(config_version).__name__}."
        )

    discount_rate = raw["discount_rate"]
    if isinstance(discount_rate, bool) or not isinstance(discount_rate, (int, float)):
        raise CountryConfigError(
            f"Country config for '{iso3}': 'discount_rate' must be a number, "
            f"got {type(discount_rate).__name__}."
        )

    growth_raw = raw["annual_growth_rate"]
    if not isinstance(growth_raw, dict):
        raise CountryConfigError(
            f"Country config for '{iso3}': 'annual_growth_rate' must be an object "
            f"of {{sector: rate}}, got {type(growth_raw).__name__}."
        )
    growth: dict[str, float] = {}
    for sector, rate in growth_raw.items():
        if isinstance(rate, bool) or not isinstance(rate, (int, float)):
            raise CountryConfigError(
                f"Country config for '{iso3}': 'annual_growth_rate.{sector}' "
                f"must be a number, got {type(rate).__name__}."
            )
        growth[str(sector)] = float(rate)

    rp_raw = raw["return_periods"]
    if not isinstance(rp_raw, dict):
        raise CountryConfigError(
            f"Country config for '{iso3}': 'return_periods' must be an object of "
            f"{{hazard_code: [years, ...]}}, got {type(rp_raw).__name__}."
        )
    return_periods: dict[str, tuple[int, ...]] = {}
    for hazard, periods in rp_raw.items():
        if not isinstance(periods, list) or not periods:
            raise CountryConfigError(
                f"Country config for '{iso3}': 'return_periods.{hazard}' must be "
                f"a non-empty list of positive integers."
            )
        for value in periods:
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise CountryConfigError(
                    f"Country config for '{iso3}': 'return_periods.{hazard}' "
                    f"contains non-positive-integer value {value!r}."
                )
        return_periods[str(hazard)] = tuple(periods)

    refs = raw["source_references"]
    if not isinstance(refs, list) or not all(isinstance(r, str) for r in refs):
        raise CountryConfigError(
            f"Country config for '{iso3}': 'source_references' must be a list of strings."
        )

    return CountryConfig(
        config_version=config_version,
        country_code=str(raw["country_code"]),
        country_name=str(raw["country_name"]),
        discount_rate=float(discount_rate),
        annual_growth_rate=growth,
        return_periods=return_periods,
        source_references=tuple(refs),
    )
