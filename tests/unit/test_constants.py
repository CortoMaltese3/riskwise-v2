"""Unit tests for ``backend.constants.get_base_dir`` (issue #196).

The bundled-aware resolver is the single source of truth for where the
shipped-data trees (``data/``, ``countries/``, ``requirements/``) live at
runtime. Tests cover both branches: dev checkout (no ``sys.frozen``) and
each bundle mode (Nuitka onefile, Nuitka standalone, PyInstaller onedir).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from backend import constants


def test_dev_checkout_returns_repo_root(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without ``sys.frozen`` the resolver walks up from the constants module."""
    monkeypatch.delattr(sys, "frozen", raising=False)

    base = constants.get_base_dir()

    expected = Path(constants.__file__).resolve().parent.parent
    assert base == expected
    assert (base / "backend" / "constants.py").is_file()


def test_nuitka_onefile_uses_executable_parent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Under Nuitka onefile ``sys.executable`` is the originating .exe.

    The bug from issue #196 was using ``Path(__file__).parent.parent`` which
    landed in ``%TEMP%\\ONEFIL~1\\`` instead of the directory holding the
    engine binary. The fix returns ``Path(sys.executable).parent``.
    """
    bundle_dir = tmp_path / "dist" / "nuitka"
    bundle_dir.mkdir(parents=True)
    fake_exe = bundle_dir / "riskwise-engine.exe"
    fake_exe.write_bytes(b"")

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(fake_exe))

    assert constants.get_base_dir() == bundle_dir.resolve()


def test_nuitka_standalone_onedir_uses_executable_parent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Nuitka ``--standalone`` (onedir) puts the .exe inside ``*.dist/``."""
    dist_dir = tmp_path / "dist" / "nuitka" / "riskwise-engine.dist"
    dist_dir.mkdir(parents=True)
    fake_exe = dist_dir / "riskwise-engine.exe"
    fake_exe.write_bytes(b"")

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(fake_exe))

    assert constants.get_base_dir() == dist_dir.resolve()


def test_pyinstaller_onedir_uses_executable_parent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """PyInstaller onedir places the .exe in the bundle root, not inside ``_internal``."""
    bundle_dir = tmp_path / "dist" / "pyinstaller" / "riskwise-engine"
    bundle_dir.mkdir(parents=True)
    fake_exe = bundle_dir / "riskwise-engine.exe"
    fake_exe.write_bytes(b"")

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(fake_exe))

    assert constants.get_base_dir() == bundle_dir.resolve()
