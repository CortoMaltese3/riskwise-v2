"""Tests for :mod:`backend.__main__` (issue #113).

The module is a thin shim — its only job is to hand control to
``app.run``. These tests lock in that contract so a future "refactor"
that duplicates startup logic here (and bypasses the ready-event
printer in ``_ReadyNotifyServer``) breaks CI instead of shipping.
"""

from __future__ import annotations

import importlib.util
import runpy
from pathlib import Path
from unittest.mock import patch

import app as app_module


def _main_path() -> Path:
    return Path(__file__).resolve().parent / "__main__.py"


def test_main_module_rebinds_app_run() -> None:
    """Importing ``__main__`` by path must expose the same ``run`` symbol."""
    spec = importlib.util.spec_from_file_location("_riskwise_main_under_test", _main_path())
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.run is app_module.run


def test_main_script_invokes_run() -> None:
    """Executing the file as ``__main__`` must call ``app.run`` exactly once."""
    with patch.object(app_module, "run") as mock_run:
        runpy.run_path(str(_main_path()), run_name="__main__")
    mock_run.assert_called_once_with()
