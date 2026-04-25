"""Entry point for ``python -m backend`` and the bundled Nuitka/PyInstaller engine.

Delegates to :func:`app.run`, which binds the FastAPI server on
``127.0.0.1:0`` and emits ``{"type":"event","name":"ready","port":N}``
on stdout before accepting connections. Kept intentionally tiny so the
bundler's static analyser has one obvious entry point and nothing to
infer. See ``docs/spikes/adr-bundling.md §3.1``.
"""

from __future__ import annotations

from app import run

if __name__ == "__main__":
    run()
