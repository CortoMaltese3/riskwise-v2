"""Resolve the directory RISK WISE scans for user-supplied country packs.

The scan root is ``<user-data>/countries/`` where ``<user-data>`` is picked
in this order:

1. ``RISKWISE_USER_DATA_DIR`` env var — full override, used by tests and by
   ops to point the engine at an alternate tree. An explicit empty string
   disables the scan entirely.
2. Platform default:
   - Windows: ``%APPDATA%/RISK WISE/user-data``
   - macOS: ``~/Library/Application Support/RISK WISE/user-data``
   - Linux/other: ``$XDG_DATA_HOME/RISK WISE/user-data`` or
     ``~/.local/share/RISK WISE/user-data``

The helper never creates the directory — absence is a normal state meaning
"no custom countries installed". Callers must check ``is_dir()`` before
iterating.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_USER_DATA_ENV = "RISKWISE_USER_DATA_DIR"
_APP_SUBDIR = "RISK WISE"
_USER_DATA_LEAF = "user-data"
_COUNTRIES_LEAF = "countries"


def get_user_data_root() -> Path | None:
    """Return the user-data root or ``None`` if scanning is disabled.

    An empty string in ``RISKWISE_USER_DATA_DIR`` disables scanning; any
    non-empty value wins over the platform default.
    """
    override = os.environ.get(_USER_DATA_ENV)
    if override is not None:
        return Path(override) if override else None
    return _platform_default()


def get_user_data_countries_dir() -> Path | None:
    """Return ``<user-data>/countries`` or ``None`` if scanning is disabled."""
    root = get_user_data_root()
    return (root / _COUNTRIES_LEAF) if root else None


def _platform_default() -> Path:
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA")
        if base:
            return Path(base) / _APP_SUBDIR / _USER_DATA_LEAF
        return Path.home() / "AppData" / "Roaming" / _APP_SUBDIR / _USER_DATA_LEAF
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / _APP_SUBDIR / _USER_DATA_LEAF
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / _APP_SUBDIR / _USER_DATA_LEAF
