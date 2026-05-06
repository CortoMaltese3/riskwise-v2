"""
Module to handle directory paths and configurations.

This module provides variables/constants to store directory paths for data, logs, backend,
and requirements. It also includes a function to determine the base directory depending on whether
the script is running in a bundled environment or a normal Python environment.

Constants:

- BASE_DIR: Base directory path of the project.
- DATA_DIR: Directory path for storing data files.
- DATA_ENTITIES_DIR: Directory path for storing entities data.
- DATA_EXPOSURES_DIR: Directory path for storing exposures data.
- DATA_HAZARDS_DIR: Directory path for storing hazards data.
- DATA_TEMP_DIR: Directory path for storing temporary data.
- LOG_DIR: Directory path for storing log files.
- BACKEND_DIR: Directory path for the backend code.
- REQUIREMENTS_DIR: Directory path for storing requirements files.

Functions:

- get_base_dir():
    Function to determine the base directory path depending on the environment.
"""

import os
import sys
from pathlib import Path


def get_base_dir() -> Path:
    """Return the dir holding the shipped ``data/``, ``countries/``, ``requirements/`` trees.

    In a bundle (Nuitka ``--onefile`` / ``--standalone``, PyInstaller
    ``--onedir``) ``__file__`` points inside the unpacked module image —
    for Nuitka onefile that is ``%TEMP%\\ONEFIL~1\\…``, which does *not*
    contain the shipped data. The shipped data is copied next to the
    launching ``.exe`` by the build scripts (see
    ``docs/spikes/adr-bundling.md`` §3.5).

    For Nuitka onefile, ``sys.executable.resolve()`` follows into the
    temp extraction dir instead of returning the launcher's path, so we
    consult ``NUITKA_ONEFILE_BINARY`` first — Nuitka exports it before
    user code runs and it always points at the original ``.exe``. The
    env-var check is unconditional (not gated on ``sys.frozen``) because
    Nuitka does not reliably set ``sys.frozen`` (that's a PyInstaller
    convention; Nuitka sets ``__compiled__`` instead). For Nuitka
    ``--standalone`` and PyInstaller, ``sys.executable`` is already the
    right answer.

    In a dev checkout, ``backend/`` is the package root and the shipped
    data lives one level up at the repo root.

    :return: The base directory of the application.
    :rtype: Path
    """
    onefile_binary = os.environ.get("NUITKA_ONEFILE_BINARY")
    if onefile_binary:
        return Path(onefile_binary).resolve().parent
    if getattr(sys, "frozen", False) or "__compiled__" in globals():
        return Path(sys.executable).resolve().parent

    return Path(__file__).resolve().parent.parent


def get_user_data_dir() -> Path:
    """
    Get the persistent user data directory.

    This function checks for the "RISKWISE_USER_DATA" environment variable to determine
    the path for storing persistent user data. If the environment variable is not set,
    it defaults to a ".user-data" directory located in the parent directory of the current script.

    :return: The user data directory path.
    :rtype: Path
    """
    env_path = os.getenv("RISKWISE_USER_DATA")
    if env_path:
        return Path(env_path)

    # dev fallback
    return Path(__file__).resolve().parent.parent / ".user-data"


BASE_DIR = get_base_dir()
USER_DATA_DIR = get_user_data_dir()  # persistent

# DATA (immutable seed)
DATA_DIR = BASE_DIR / "data"
DATA_ENTITIES_DIR = DATA_DIR / "entities"
DATA_HAZARDS_DIR = DATA_DIR / "hazards"
DATA_MANIFEST_PATH = DATA_DIR / "manifest.json"

# COUNTRIES (immutable seed: per-country config + impact functions)
COUNTRIES_DIR = BASE_DIR / "countries"

# DATA (persistent outputs)
PERSIST_DATA_DIR = USER_DATA_DIR / "data"
DATA_EXPOSURES_DIR = PERSIST_DATA_DIR / "exposures"
DATA_TEMP_DIR = PERSIST_DATA_DIR / "temp"
REPORTS_DIR = PERSIST_DATA_DIR / "reports"

# LOGS (persistent)
LOG_DIR = USER_DATA_DIR / "logs"

# BACKEND (immutable)
BACKEND_DIR = BASE_DIR / "backend"

# REQUIREMENTS (immutable)
REQUIREMENTS_DIR = BASE_DIR / "requirements"
