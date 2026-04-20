"""Parquet sidecar round-trip for the v2 entity loader.

``EntityHandler`` is the legacy v1 class and imports CLIMADA at module
top. The sidecar helper itself is pure pandas + pathlib, so we exercise
it against a real ``.xlsx`` written on the fly — no CLIMADA needed.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pandas as pd
import pytest


def _load_handler() -> type:
    """Import ``EntityHandler`` after installing CLIMADA stubs.

    The module-level CLIMADA imports must resolve even on workstations
    without the geospatial stack; ``tests.unit.conftest`` registers the
    same stub modules but only runs once per session, so we register the
    minimum here too for robustness when this file is collected first.
    """
    for name, attrs in (
        ("climada", {}),
        ("climada.util", {}),
        ("climada.util.api_client", {"Client": type("Client", (), {})}),
        (
            "climada.entity",
            {
                "DiscRates": type("DiscRates", (), {}),
                "Entity": type("Entity", (), {}),
                "Exposures": type("Exposures", (), {}),
                "ImpactFuncSet": type("ImpactFuncSet", (), {}),
            },
        ),
        ("climada.entity.measures", {"MeasureSet": type("MeasureSet", (), {})}),
        ("climada.entity.impact_funcs", {"ImpactFuncSet": type("ImpactFuncSet", (), {})}),
    ):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            for attr, value in attrs.items():
                setattr(mod, attr, value)
            sys.modules[name] = mod

    from entity.entity_handler import EntityHandler  # noqa: E402

    return EntityHandler


def test_parquet_sidecar_path_siblings_xlsx() -> None:
    EntityHandler = _load_handler()
    assert EntityHandler.parquet_sidecar_path(Path("a/b.xlsx")) == Path("a/b.parquet")


def test_load_exposures_dataframe_writes_sidecar_then_reads_it(tmp_path: Path) -> None:
    EntityHandler = _load_handler()
    handler = EntityHandler.__new__(EntityHandler)
    xlsx = tmp_path / "entity.xlsx"
    pd.DataFrame({"value": [1.0, 2.0], "name": ["a", "b"]}).to_excel(xlsx, index=False)

    # First call: parses the xlsx, writes the sidecar.
    df_first = handler.load_exposures_dataframe(xlsx)
    sidecar = EntityHandler.parquet_sidecar_path(xlsx)
    assert sidecar.is_file()
    assert list(df_first["value"]) == [1.0, 2.0]

    # Corrupt the xlsx so the sidecar must be what's returned on the
    # second call — this asserts the parquet is actually preferred.
    # Bump the sidecar mtime ahead of the corrupted xlsx so the freshness
    # check picks the parquet.
    xlsx.write_bytes(b"not a real xlsx")
    import os

    new_mtime = xlsx.stat().st_mtime + 100
    os.utime(sidecar, (new_mtime, new_mtime))
    df_second = handler.load_exposures_dataframe(xlsx)
    assert list(df_second["value"]) == [1.0, 2.0]


def test_load_exposures_dataframe_refreshes_on_stale_sidecar(tmp_path: Path) -> None:
    EntityHandler = _load_handler()
    handler = EntityHandler.__new__(EntityHandler)
    xlsx = tmp_path / "entity.xlsx"
    sidecar = EntityHandler.parquet_sidecar_path(xlsx)

    pd.DataFrame({"value": [1]}).to_parquet(sidecar, index=False)
    pd.DataFrame({"value": [99]}).to_excel(xlsx, index=False)

    # Make xlsx newer than the sidecar.
    import os

    sidecar_mtime = sidecar.stat().st_mtime
    os.utime(xlsx, (sidecar_mtime + 10, sidecar_mtime + 10))

    df = handler.load_exposures_dataframe(xlsx)
    assert list(df["value"]) == [99]


@pytest.fixture(autouse=True)
def _stub_constants(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # ``constants`` resolves DATA_ENTITIES_DIR at import time; the helper we
    # exercise does not use it, but importing the handler module touches the
    # real path. Nothing to assert here — fixture just neutralises side
    # effects across workstations.
    yield
