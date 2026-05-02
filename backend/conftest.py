"""Test isolation for the FastAPI app-level suite.

Forces ``RISKWISE_USER_DATA_DIR`` to an empty string and drops the
extensibility registry cache before every test so a developer's local
``%APPDATA%/RISK WISE/user-data/`` tree never bleeds into the backend
tests. CI runs in a clean HOME so this is mostly a Windows-dev
ergonomics fix; it also ensures the ``/api/v1/countries`` endpoint is
tested against the built-in set only unless a test opts in.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def _isolate_user_data_registry(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("RISKWISE_USER_DATA_DIR", "")
    # The manifest-verify hook would otherwise hash every file under
    # ``data/`` at lifespan startup; skipping it keeps the suite fast.
    monkeypatch.setenv("RISKWISE_SKIP_MANIFEST_VERIFY", "1")
    # Drop the process-cached registry before and after each test so the
    # next test sees a fresh scan against whatever env its own fixtures
    # set up.
    try:
        from backend.extensibility.registry import reset_registry

        reset_registry()
    except ImportError:
        pass
    yield
    try:
        from backend.extensibility.registry import reset_registry

        reset_registry()
    except ImportError:
        pass
    # Also drop the impact-function registry cache between tests; it
    # keys off the extensibility registry, so stale state there causes
    # surprising interactions.
    try:
        from backend.impact.impact_handler import reset_registry_cache

        reset_registry_cache()
    except ImportError:
        pass
