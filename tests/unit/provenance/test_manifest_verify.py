"""Tests for :func:`provenance.verify_manifest`.

Covers the two branches that matter in production: a matching manifest
passes silently, and any tampered or missing file aborts with a
:class:`provenance.ManifestError` naming the bad file. A dev-env bypass
flag exists so tests and custom builds can skip verification without
editing the manifest.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.provenance import ManifestError, generate_manifest, verify_manifest


def _write_tree(tmp_path: Path) -> tuple[Path, Path]:
    """Seed ``data/`` and ``requirements/`` with minimal content to hash."""
    data_dir = tmp_path / "data"
    (data_dir / "entities").mkdir(parents=True)
    (data_dir / "adaptation_measures.xlsx").write_bytes(b"xlsx")
    (data_dir / "entities" / "sample.xlsx").write_bytes(b"sample")
    req_dir = tmp_path / "requirements"
    req_dir.mkdir()
    (req_dir / "requirements.txt").write_bytes(b"pkg==1.0\n")
    return data_dir, req_dir


def _manifest_for(tmp_path: Path) -> dict[str, str]:
    data_dir, req_dir = _write_tree(tmp_path)
    return generate_manifest(
        [
            (data_dir, ["adaptation_measures.xlsx", "entities/*.xlsx"]),
            (req_dir, ["requirements.txt"]),
        ],
        tmp_path,
    )


def test_verify_passes_when_manifest_matches(tmp_path: Path) -> None:
    manifest = _manifest_for(tmp_path)
    manifest_path = tmp_path / "data" / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Pass path returns None; no exception = success.
    verify_manifest(manifest_path, tmp_path)


def test_verify_aborts_on_tampered_file(tmp_path: Path) -> None:
    manifest = _manifest_for(tmp_path)
    manifest_path = tmp_path / "data" / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Tamper with a file that's in the manifest.
    (tmp_path / "data" / "adaptation_measures.xlsx").write_bytes(b"TAMPERED")

    with pytest.raises(ManifestError, match="adaptation_measures.xlsx"):
        verify_manifest(manifest_path, tmp_path)


def test_verify_aborts_on_missing_file(tmp_path: Path) -> None:
    manifest = _manifest_for(tmp_path)
    manifest_path = tmp_path / "data" / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    (tmp_path / "data" / "adaptation_measures.xlsx").unlink()

    with pytest.raises(ManifestError, match="adaptation_measures.xlsx"):
        verify_manifest(manifest_path, tmp_path)


def test_verify_rejects_malformed_manifest(tmp_path: Path) -> None:
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text("{not json", encoding="utf-8")

    with pytest.raises(ManifestError, match="not valid JSON"):
        verify_manifest(manifest_path, tmp_path)


def test_skip_flag_short_circuits_verification(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Missing manifest; would normally raise. Skip flag keeps us silent.
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    verify_manifest(tmp_path / "does-not-exist.json", tmp_path)


def test_generate_manifest_uses_posix_separators(tmp_path: Path) -> None:
    manifest = _manifest_for(tmp_path)
    for key in manifest:
        assert "\\" not in key, f"backslash in manifest key: {key}"
