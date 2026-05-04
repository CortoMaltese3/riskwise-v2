"""Engine-backend tests for ``EntityHandler.get_entity_from_xlsx``.

After #166 CLIMADA is removed entirely; the engine path is the only path.
``EntityHandler.get_entity_from_xlsx`` returns an
:class:`backend.engine.types.EntityBundle` produced by
:func:`backend.engine.loaders.xlsx.load_entity_xlsx`.

The fixture file (``tests/fixtures/entities/egy_economic_present.xlsx``)
is the EGY-flood entity workbook used across the engine-backend test
suite. Tests are skipped when it is not checked out (slim CI runs).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.engine.types import EntityBundle
from backend.entity.entity_handler import EntityHandler

FIXTURES = Path(__file__).parents[2] / "fixtures" / "entities"
EGY_XLSX = FIXTURES / "egy_economic_present.xlsx"


def _xlsx_available() -> bool:
    return EGY_XLSX.is_file()


pytestmark = pytest.mark.skipif(
    not _xlsx_available(),
    reason=f"Entity fixture {EGY_XLSX.name} not present in tests/fixtures/entities/",
)


@pytest.fixture
def isolated_entity_dir(monkeypatch, tmp_path):
    """Point ``DATA_ENTITIES_DIR`` at a temp dir that aliases the fixture file."""
    fixture = tmp_path / EGY_XLSX.name
    fixture.write_bytes(EGY_XLSX.read_bytes())
    monkeypatch.setattr("backend.constants.DATA_ENTITIES_DIR", tmp_path)
    monkeypatch.setattr("backend.entity.entity_handler.DATA_ENTITIES_DIR", tmp_path)
    return fixture.name


def test_engine_backend_returns_entity_bundle(isolated_entity_dir) -> None:
    bundle = EntityHandler().get_entity_from_xlsx(isolated_entity_dir)
    assert isinstance(bundle, EntityBundle)
    assert bundle.exposures.values is not None
    assert bundle.exposures.values.size > 0


def test_engine_backend_caches_bundle(isolated_entity_dir) -> None:
    handler = EntityHandler()
    first = handler.get_entity_from_xlsx(isolated_entity_dir)
    second = handler.get_entity_from_xlsx(isolated_entity_dir)
    assert first is second
