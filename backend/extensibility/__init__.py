"""Extensibility surface for RISK WISE.

Today this package owns the drop-in custom country feature (issue #56): at
startup we scan ``%APPDATA%/RISK WISE/user-data/countries/{ISO3}/`` for
user-supplied ``config.json`` + ``impact_functions.json`` pairs and merge
them alongside the shipped Egypt / Thailand built-ins. Phase 3 will grow
this package with custom hazards and measures.
"""

from __future__ import annotations

from .registry import (
    BUILTIN_COUNTRY_CODES,
    CountryRegistry,
    CountrySource,
    ExtensibilityError,
    RegisteredCountry,
    build_registry,
    get_registry,
    reset_registry,
)
from .user_data import get_user_data_countries_dir

__all__ = [
    "BUILTIN_COUNTRY_CODES",
    "CountryRegistry",
    "CountrySource",
    "ExtensibilityError",
    "RegisteredCountry",
    "build_registry",
    "get_registry",
    "get_user_data_countries_dir",
    "reset_registry",
]
