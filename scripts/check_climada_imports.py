"""Lint rule: no ``climada`` import anywhere in ``backend/``.

Strengthens the engine-import rule from #151. After #166 the CLIMADA
package is gone from runtime deps; any new code that re-introduces
``import climada`` or ``from climada`` must fail CI immediately so the
removal does not silently regress.

The rule scans ``backend/`` and exits non-zero on any matching line.
Legacy v1 handler tests (``backend/{exposure,hazard,impact,report}/test_*_handler.py``)
are excluded — they are scope-bounded for deletion in a follow-up issue
(#T5.2) and would otherwise block CI on this issue. They are also
already excluded from pytest collection via ``pyproject.toml``.

Run via ``python scripts/check_climada_imports.py`` or as the
``CLIMADA import boundary`` step in ``.github/workflows/tests.yml``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERN = re.compile(r"^\s*(?:from|import)\s+climada\b")
SCAN_ROOT = Path("backend")
# Legacy v1 handler tests — ignored by pytest, scoped for deletion in #T5.2.
LEGACY_TEST_PATTERNS = (
    "backend/exposure/test_exposure_handler.py",
    "backend/hazard/test_hazard_handler.py",
    "backend/impact/test_impact_handler.py",
    "backend/report/test_report_handler.py",
)


def _is_legacy_test(path: Path) -> bool:
    return path.as_posix() in LEGACY_TEST_PATTERNS


def main() -> int:
    if not SCAN_ROOT.is_dir():
        print(
            f"check_climada_imports: {SCAN_ROOT}/ not found; run from the repo root.",
            file=sys.stderr,
        )
        return 2

    violations: list[str] = []
    for path in SCAN_ROOT.rglob("*.py"):
        if _is_legacy_test(path):
            continue
        with path.open(encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if PATTERN.match(line):
                    violations.append(f"{path.as_posix()}:{lineno}: {line.rstrip()}")

    if violations:
        print(
            "Forbidden CLIMADA import in backend/:",
            file=sys.stderr,
        )
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "\nCLIMADA was removed from runtime deps in #166. "
            "Route through `backend.engine.adapter` instead.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
