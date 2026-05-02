"""Fail if any file under ``backend/`` or ``tests/`` uses shallow imports.

The unbundled engine boots via ``python -m backend`` (issue #195), which
puts the repo root on ``sys.path``. Shallow imports like ``from db import
…`` only resolve when ``backend/`` itself is on ``sys.path``, so they
silently break the boot path. This script enforces that every in-repo
import goes through the ``backend`` package.

Run from the repo root::

    python scripts/check_backend_imports.py

Exit code 0 → clean; non-zero → the listed lines must be rewritten.
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
TESTS = REPO_ROOT / "tests"


# Discover the names that ``backend/`` exposes as top-level modules /
# subpackages. Anything that resolves to one of these via a non-prefixed
# ``from X`` or ``import X`` is a shallow import that should be rewritten
# as ``from backend.X`` / ``import backend.X``.
def _backend_top_level_names() -> set[str]:
    names: set[str] = set()
    for entry in BACKEND.iterdir():
        if entry.is_dir() and (entry / "__init__.py").exists():
            names.add(entry.name)
        elif entry.suffix == ".py" and entry.stem not in {"__init__", "__main__"}:
            names.add(entry.stem)
    return names


def _iter_py_files() -> list[Path]:
    return [
        *BACKEND.rglob("*.py"),
        *TESTS.rglob("*.py"),
    ]


def _shallow_imports(path: Path, top_level: set[str]) -> list[tuple[int, str]]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as exc:
        return [(exc.lineno or 0, f"SyntaxError: {exc.msg}")]
    offenders: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.level != 0 or node.module is None:
                continue
            root = node.module.split(".", 1)[0]
            if root in top_level:
                offenders.append((node.lineno, f"from {node.module} import …"))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".", 1)[0]
                if root in top_level:
                    offenders.append((node.lineno, f"import {alias.name}"))
    return offenders


def main() -> int:
    top_level = _backend_top_level_names()
    failures: list[str] = []
    for path in _iter_py_files():
        for lineno, snippet in _shallow_imports(path, top_level):
            rel = path.relative_to(REPO_ROOT)
            failures.append(f"{rel}:{lineno}: {snippet}")
    if failures:
        print("Shallow imports found — rewrite as `from backend.X` / `import backend.X`:")
        for line in failures:
            print(f"  {line}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
