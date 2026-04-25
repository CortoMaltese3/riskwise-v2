"""End-to-end tests for ``backend.plugins.pack_verifier.verify_riskwise_pack``.

The tests build a real ``.riskwise-pack`` ZIP, generate a minisign keypair,
sign the pack, and exercise both the pass and tamper-fail paths through the
real ``minisign`` binary. The whole module is skipped if minisign is not
installed on the runner so a slim dev box can still run ``pytest`` — CI on
the Phase 4 release matrix has minisign available (see release.yml).
"""

from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

from backend.plugins.pack_verifier import verify_riskwise_pack

pytestmark = pytest.mark.skipif(
    shutil.which("minisign") is None,
    reason="minisign binary not installed on PATH",
)


def _generate_keypair(workdir: Path) -> tuple[Path, Path]:
    """Generate an unencrypted minisign keypair scoped to a tmp dir.

    ``-W`` writes a passwordless key, which keeps the test free of stdin
    plumbing. ``-f`` forces overwrite if the runner is reused. Returns
    ``(secret_key_path, public_key_path)``.
    """
    secret = workdir / "test.key"
    public = workdir / "test.pub"
    subprocess.run(
        ["minisign", "-G", "-W", "-f", "-s", str(secret), "-p", str(public)],
        check=True,
        capture_output=True,
    )
    return secret, public


def _build_pack(workdir: Path, name: str = "sample.riskwise-pack") -> Path:
    """Produce a tiny but valid ZIP file with the .riskwise-pack extension."""
    pack = workdir / name
    with zipfile.ZipFile(pack, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", '{"pack_id": "sample", "version": "1.0.0"}')
        zf.writestr("payload.bin", b"\x00\x01\x02\x03")
    return pack


def _sign_pack(secret_key: Path, pack: Path) -> Path:
    """Sign ``pack`` in place; minisign drops ``<pack>.minisig`` next to it."""
    subprocess.run(
        ["minisign", "-S", "-W", "-s", str(secret_key), "-m", str(pack)],
        check=True,
        capture_output=True,
    )
    sig = pack.with_suffix(pack.suffix + ".minisig")
    assert sig.is_file(), "minisign did not produce a .minisig file"
    return sig


def test_verify_pass(tmp_path: Path) -> None:
    secret, public = _generate_keypair(tmp_path)
    pack = _build_pack(tmp_path)
    _sign_pack(secret, pack)

    assert verify_riskwise_pack(pack, public) is True


def test_verify_fail_when_pack_tampered(tmp_path: Path) -> None:
    secret, public = _generate_keypair(tmp_path)
    pack = _build_pack(tmp_path)
    _sign_pack(secret, pack)

    # Mutate one byte inside the ZIP so the signature no longer matches the
    # pack's bytes. Appending instead of rewriting keeps the ZIP structurally
    # parseable while still failing the signature check — this mirrors the
    # realistic threat model of an attacker bolting extra data onto a pack.
    with pack.open("ab") as fh:
        fh.write(b"tampered")

    assert verify_riskwise_pack(pack, public) is False


def test_verify_fail_when_signature_missing(tmp_path: Path) -> None:
    _, public = _generate_keypair(tmp_path)
    pack = _build_pack(tmp_path)

    assert verify_riskwise_pack(pack, public) is False


def test_verify_fail_when_pubkey_mismatched(tmp_path: Path) -> None:
    signing_secret, _ = _generate_keypair(tmp_path)
    pack = _build_pack(tmp_path)
    _sign_pack(signing_secret, pack)

    other_dir = tmp_path / "other"
    other_dir.mkdir()
    _, other_public = _generate_keypair(other_dir)

    assert verify_riskwise_pack(pack, other_public) is False
