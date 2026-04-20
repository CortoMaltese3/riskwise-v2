"""Registry of all countries RISK WISE can run — built-in plus custom.

Two inputs feed the registry:

* **Built-in countries** — the ISO3 codes listed in
  :data:`BUILTIN_COUNTRY_CODES`, resolved under the repo's ``countries/``
  tree. Their ``config.json`` + ``impact_functions.json`` are shipped.
* **Custom countries** — every ``{ISO3}/`` subdirectory under
  ``<user-data>/countries/`` (see :mod:`extensibility.user_data`). Analysts
  drop these in at runtime; scanning happens once at startup.

Rules enforced at scan time
---------------------------
* **Namespace isolation** — a custom ISO3 that matches a built-in is a
  hard error. The loader raises :class:`ExtensibilityError` rather than
  silently shadowing the shipped config, so an accidental
  ``countries/EGY/`` drop-in cannot produce a run that looks identical but
  uses different constants.
* **Per-entry validation isolation** — an invalid custom country does not
  take down the registry: its error is collected on
  :attr:`CountryRegistry.errors` for the API / logs to surface, and the
  other valid entries continue to load (Scenario 3 of issue #56).
* **ID uniqueness across the merged set** — impact-function validation
  (intensity monotonicity, unit consistency, ``(haz_type, exp_type, id)``
  uniqueness) is delegated to :class:`impact.registry.ImpactFunctionRegistry`
  and runs once over the combined built-in + custom spec list.

The module exposes a process-wide cached :func:`get_registry` so handlers
can read it cheaply on every request; tests call :func:`reset_registry`
between cases to pick up a fresh scan against a ``tmp_path``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from .user_data import get_user_data_countries_dir


class ExtensibilityError(Exception):
    """Raised when the custom-country scan hits a fatal condition.

    Fatal today means only namespace collision — everything else
    (missing/invalid config or impact_functions) is surfaced as a
    per-entry error on the :class:`CountryRegistry` so the rest of the
    registry still loads.
    """


class CountrySource(StrEnum):
    """Where a country's config originated. Matches the API ``source`` field."""

    BUILTIN = "builtin"
    CUSTOM = "custom"


# Built-in ISO3 codes shipped with the repository. Order is the display
# order the API returns built-ins in; custom countries follow after.
BUILTIN_COUNTRY_CODES: tuple[str, ...] = ("EGY", "THA")


@dataclass(frozen=True)
class RegisteredCountry:
    """One entry in :class:`CountryRegistry` — either built-in or custom.

    ``base_dir`` points at the directory holding ``config.json`` and
    (optionally) ``impact_functions.json`` for this country. ``name`` is
    resolved lazily from the config; for the API response callers can read
    ``code`` alone if they want to avoid parsing the config.
    """

    code: str
    name: str
    source: CountrySource
    base_dir: Path
    config_path: Path
    impact_functions_path: Path | None


@dataclass
class CountryRegistry:
    """All countries visible to the backend this process-lifetime.

    :attr:`errors` holds ``(iso3, message)`` pairs for custom entries that
    failed validation. They do not abort startup but the API and logs
    surface them so the analyst can fix their drop-in.
    """

    countries: tuple[RegisteredCountry, ...]
    errors: tuple[tuple[str, str], ...] = field(default_factory=tuple)

    def get(self, iso3: str) -> RegisteredCountry | None:
        key = iso3.upper()
        for entry in self.countries:
            if entry.code == key:
                return entry
        return None

    def codes(self) -> tuple[str, ...]:
        return tuple(entry.code for entry in self.countries)

    def impact_function_paths(self) -> tuple[tuple[str, Path], ...]:
        """Return ``(iso3, impact_functions.json)`` pairs for every country that ships one.

        The impact registry caller merges these into a single validated
        :class:`ImpactFunctionRegistry`; the order mirrors the country
        order so built-ins are parsed first and custom entries are
        rejected by the uniqueness check rather than overwriting them.
        """
        return tuple(
            (entry.code, entry.impact_functions_path)
            for entry in self.countries
            if entry.impact_functions_path is not None
        )


_registry_cache: CountryRegistry | None = None


def get_registry() -> CountryRegistry:
    """Return the process-cached registry, building it on first call."""
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = build_registry()
    return _registry_cache


def reset_registry() -> None:
    """Drop the cached registry. Tests call this to pick up env / fs changes."""
    global _registry_cache
    _registry_cache = None


class _Sentinel:
    """Marker type for the "unset" kwarg default of :func:`build_registry`."""


_UNSET: _Sentinel = _Sentinel()


def build_registry(
    builtin_root: Path | None = None,
    user_data_countries_dir: Path | None | _Sentinel = _UNSET,
    builtin_codes: Iterable[str] = BUILTIN_COUNTRY_CODES,
) -> CountryRegistry:
    """Scan the built-in tree + user-data tree and return a :class:`CountryRegistry`.

    :param builtin_root: Override the ``countries/`` root (tests). Defaults
        to the repo-level directory.
    :param user_data_countries_dir: Override the user-data scan path. Omit
        (the default ``_UNSET``) to resolve via
        :func:`user_data.get_user_data_countries_dir`; pass an explicit
        ``None`` to disable custom scanning entirely.
    """
    if builtin_root is None:
        builtin_root = _default_builtin_root()

    # Sentinel distinguishes "use default resolver" from "explicitly None"
    # without forcing tests to mutate the env var.
    if user_data_countries_dir is _UNSET:
        resolved_user_dir = get_user_data_countries_dir()
    else:
        resolved_user_dir = user_data_countries_dir  # type: ignore[assignment]

    builtin_entries = _load_builtin_entries(builtin_root, tuple(builtin_codes))
    builtin_iso3s = {entry.code for entry in builtin_entries}

    custom_entries: list[RegisteredCountry] = []
    errors: list[tuple[str, str]] = []
    if resolved_user_dir is not None and Path(resolved_user_dir).is_dir():
        custom_entries, errors = _scan_custom_countries(Path(resolved_user_dir), builtin_iso3s)

    return CountryRegistry(
        countries=tuple(builtin_entries) + tuple(custom_entries),
        errors=tuple(errors),
    )


# --- internals ---------------------------------------------------------------


def _default_builtin_root() -> Path:
    # backend/extensibility/registry.py -> repo_root/countries
    return Path(__file__).resolve().parents[2] / "countries"


def _load_builtin_entries(root: Path, codes: tuple[str, ...]) -> list[RegisteredCountry]:
    entries: list[RegisteredCountry] = []
    for code in codes:
        iso3 = code.upper()
        base_dir = root / iso3
        config_path = base_dir / "config.json"
        impact_path = base_dir / "impact_functions.json"
        name = _peek_country_name(config_path, default=iso3)
        entries.append(
            RegisteredCountry(
                code=iso3,
                name=name,
                source=CountrySource.BUILTIN,
                base_dir=base_dir,
                config_path=config_path,
                impact_functions_path=impact_path if impact_path.is_file() else None,
            )
        )
    return entries


def _scan_custom_countries(
    user_countries_dir: Path,
    builtin_iso3s: set[str],
) -> tuple[list[RegisteredCountry], list[tuple[str, str]]]:
    """Scan the user-data countries dir.

    Returns (entries, errors). Iteration order is sorted by ISO3 for a
    deterministic API response.
    """
    entries: list[RegisteredCountry] = []
    errors: list[tuple[str, str]] = []

    for child in sorted(user_countries_dir.iterdir()):
        if not child.is_dir():
            continue
        iso3 = child.name.upper()
        if iso3 in builtin_iso3s:
            # Namespace collision is a hard error: a silently-shadowing
            # custom drop-in is exactly the surprise we want to prevent.
            raise ExtensibilityError(
                f"Custom country {iso3!r} at {child} shadows a built-in country. "
                f"Rename the directory or remove the drop-in; built-in ISO3 codes "
                f"cannot be overridden."
            )

        config_path = child / "config.json"
        impact_path = child / "impact_functions.json"

        if not config_path.is_file():
            errors.append(
                (
                    iso3,
                    f"Custom country {iso3!r} at {child} is missing config.json. "
                    f"Add {config_path} or remove the directory.",
                )
            )
            continue

        # Validate config.json eagerly so the API surfaces the error and
        # the invalid country is skipped rather than registered.
        # Import here to avoid a module-level circular with countries.loader.
        from countries.loader import CountryConfigError, load_country_config

        try:
            config = load_country_config(iso3, config_path=config_path)
        except CountryConfigError as exc:
            errors.append((iso3, str(exc)))
            continue

        entries.append(
            RegisteredCountry(
                code=iso3,
                name=config.country_name,
                source=CountrySource.CUSTOM,
                base_dir=child,
                config_path=config_path,
                impact_functions_path=impact_path if impact_path.is_file() else None,
            )
        )

    return entries, errors


def _peek_country_name(config_path: Path, default: str) -> str:
    """Read just ``country_name`` from a config file, or return ``default``.

    Full validation happens in :func:`countries.loader.load_country_config`;
    here we only need the label for the API response, and a corrupted
    built-in config should still let the backend boot (the scenario runner
    will fail loudly at compute time).
    """
    import json

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default
    if isinstance(raw, dict):
        name = raw.get("country_name")
        if isinstance(name, str) and name:
            return name
    return default
