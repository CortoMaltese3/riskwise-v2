"""Belt-and-braces seed-discipline check (#55 Scenario 3).

``NPY002`` in ``pyproject.toml`` is the primary guardrail — ruff blocks
new occurrences of ``np.random.seed`` / ``np.random.rand`` / ... in PRs.
This test provides a second layer that runs even when a contributor
bypasses ruff: a literal grep over ``backend/`` source files. Passing
this keeps the code honest about the ``np.random.default_rng(seed)``
allowlist the issue mandates.
"""

from __future__ import annotations

import re
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[3] / "backend"

_FORBIDDEN = re.compile(r"np\.random\.(seed|rand|randn|randint|choice|uniform|normal)\b")


def _python_sources() -> list[Path]:
    return [
        p
        for p in _BACKEND.rglob("*.py")
        if "__pycache__" not in p.parts and p.name != "test_seed_discipline.py"
    ]


def test_no_global_numpy_random_in_backend() -> None:
    offenders: list[str] = []
    for path in _python_sources():
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in _FORBIDDEN.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            offenders.append(f"{path.relative_to(_BACKEND.parent)}:{line_no}:{match.group(0)}")
    assert not offenders, (
        "Global numpy.random usage is forbidden under issue #55 — derive a "
        "Generator from np.random.default_rng(seed) instead:\n" + "\n".join(offenders)
    )
