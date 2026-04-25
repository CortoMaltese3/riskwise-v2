"""Minisign-based signature verification for ``.riskwise-pack`` data packs.

Area 14 (#116) loads optional analyst-supplied data packs at runtime. Before
any pack is unpacked we require a detached minisign signature signed by a key
the operator explicitly trusts; ``verify_riskwise_pack`` is the single entry
point Area 14 calls to gate that decision.

Verification delegates to the ``minisign`` binary (``minisign -Vm``) rather
than re-implementing Ed25519 in-process: minisign is the same tool the
release pipeline uses to sign the engine manifest, so any pack signed by the
release process is verifiable without an extra dependency.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# minisign convention: detached signatures live next to the signed file with
# the suffix ``.minisig``. Pack producers MUST follow this convention so
# Area 14 does not need a side-channel to discover the signature path.
SIG_SUFFIX = ".minisig"


def verify_riskwise_pack(path: Path, pubkey_path: Path) -> bool:
    """Return True iff ``path`` carries a valid minisign signature for ``pubkey_path``.

    Looks for a detached signature at ``<path>.minisig`` and invokes
    ``minisign -Vm <path> -p <pubkey_path>``. Returns False — never raises —
    on any of: missing minisign binary, missing pack, missing signature,
    public-key mismatch, signature tampering, pack tampering. Errors are
    logged at ``WARNING`` so an operator can diagnose a rejected pack from
    the backend logs without leaking failure details into the API response.
    """
    pack_path = Path(path)
    sig_path = pack_path.with_suffix(pack_path.suffix + SIG_SUFFIX)

    if not pack_path.is_file():
        logger.warning("pack verification: file not found: %s", pack_path)
        return False
    if not sig_path.is_file():
        logger.warning("pack verification: signature not found: %s", sig_path)
        return False
    if not Path(pubkey_path).is_file():
        logger.warning("pack verification: pubkey not found: %s", pubkey_path)
        return False

    minisign = shutil.which("minisign")
    if minisign is None:
        logger.warning("pack verification: minisign binary not on PATH")
        return False

    try:
        result = subprocess.run(
            [
                minisign,
                "-V",
                "-m",
                str(pack_path),
                "-x",
                str(sig_path),
                "-p",
                str(pubkey_path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("pack verification: minisign invocation failed: %s", exc)
        return False

    if result.returncode != 0:
        logger.warning(
            "pack verification: minisign rejected %s (rc=%s, stderr=%s)",
            pack_path,
            result.returncode,
            result.stderr.strip(),
        )
        return False

    return True
