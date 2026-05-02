"""Rebuild ``data/manifest.json`` from the shipped dataset tree.

Run from the repo root::

    python scripts/generate_manifest.py

The manifest is the contract verified on backend startup (see
``backend/provenance.py::verify_manifest``). Regenerate whenever a shipped
dataset changes so the commit-time SHA matches the bytes on disk; CI will
flag the mismatch otherwise.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.provenance import generate_manifest  # noqa: E402

MANIFEST_PATH = REPO_ROOT / "data" / "manifest.json"

# Curated allowlist of shipped assets. Matches pattern relative to each
# root. Anything gitignored (``data/exposures``, ``data/reports``, etc.) is
# excluded by not listing its directory here — the manifest is the source
# of truth for what the app considers "part of the shipped build".
_ROOTS: list[tuple[Path, list[str]]] = [
    (
        REPO_ROOT / "data",
        [
            "adaptation_measures.xlsx",
            "cred_output.xlsx",
            "report_template.docx",
            "report_data.json",
            "gadm*.geojson",
            "entities/*.xlsx",
            "hazards/*.h5",
            "hazards/*.tif",
        ],
    ),
    (REPO_ROOT / "requirements", ["requirements.txt"]),
]


def main() -> int:
    manifest = generate_manifest(_ROOTS, REPO_ROOT)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(manifest)} entries to {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
