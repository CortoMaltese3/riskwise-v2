"""Guardrail: ``assign_levels`` must have exactly one definition in ``backend/``.

The implementation used to be copy-pasted across ``HazardHandler`` and
``ImpactHandler``. Consolidation to ``BaseHandler`` should not quietly
regress — if a future change reintroduces a second copy (or accidentally
removes the canonical one), this test fails loudly.
"""

from __future__ import annotations

import re
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
_DEF_PATTERN = re.compile(r"^\s*def\s+assign_levels\s*\(", re.MULTILINE)


def test_assign_levels_has_single_definition_in_backend() -> None:
    matches: list[Path] = []
    for py_file in _BACKEND_DIR.rglob("*.py"):
        if _DEF_PATTERN.search(py_file.read_text(encoding="utf-8")):
            matches.append(py_file)

    assert len(matches) == 1, (
        f"Expected exactly one `def assign_levels` in backend/, found {len(matches)}: "
        f"{[str(p.relative_to(_BACKEND_DIR)) for p in matches]}"
    )
    # And it must live on BaseHandler, not a handler subtree.
    assert matches[0].name == "base_handler.py", (
        f"`assign_levels` should live in backend/base_handler.py, found in: {matches[0]}"
    )
