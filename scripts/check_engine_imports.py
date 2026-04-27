"""Lint rule: no `climate_lama_engine` import outside `backend/engine/`.

Per [DECISIONS.md D26](../docs/DECISIONS.md) and ADR §5.1 rule 1
([adr-climate-lama-engine-adoption.md](../docs/spikes/adr-climate-lama-engine-adoption.md)),
the engine library is a riskwise-internal concern mediated only by
`backend/engine/adapter.py`. Any other module touching
`climate_lama_engine.*` breaks the cross-project compatibility contract
because it bypasses the only place we have a single fix point when the
engine API drifts.

Walks the backend tree, skips `backend/engine/`, and exits non-zero if any
file matches a top-level `import climate_lama_engine` or
`from climate_lama_engine` line. Run via `python scripts/check_engine_imports.py`
or as the `Engine import boundary` step in `.github/workflows/tests.yml`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERN = re.compile(r"^\s*(?:from|import)\s+climate_lama_engine\b")
SCAN_ROOT = Path("backend")
ALLOWED_DIR = SCAN_ROOT / "engine"


def _is_allowed(path: Path) -> bool:
    """True if `path` is inside `backend/engine/`."""
    return path.as_posix().startswith(f"{ALLOWED_DIR.as_posix()}/")


def main() -> int:
    if not SCAN_ROOT.is_dir():
        print(
            f"check_engine_imports: {SCAN_ROOT}/ not found; run from the repo root.",
            file=sys.stderr,
        )
        return 2

    violations: list[str] = []
    for path in SCAN_ROOT.rglob("*.py"):
        if _is_allowed(path):
            continue
        with path.open(encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if PATTERN.match(line):
                    violations.append(f"{path.as_posix()}:{lineno}: {line.rstrip()}")

    if violations:
        print(
            "Forbidden climate_lama_engine import outside backend/engine/:",
            file=sys.stderr,
        )
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "\nPer DECISIONS.md D26 / adr-climate-lama-engine-adoption.md §5.1 rule 1:\n"
            "  Only `backend/engine/adapter.py` is allowed to import from "
            "`climate_lama_engine.*`.\n"
            "  Other modules must route through the adapter.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
