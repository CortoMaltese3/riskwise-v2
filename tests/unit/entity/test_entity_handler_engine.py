"""Engine-backend tests for ``EntityHandler.get_entity_from_xlsx``.

Verifies that the engine backend (default after #164) returns an
:class:`backend.engine.types.EntityBundle` from
:func:`backend.engine.loaders.xlsx.load_entity_xlsx` whose value /
impact-function / discount-rate fields match the CLIMADA path on the
same fixture, while ``RISKWISE_ENGINE_BACKEND="climada"`` keeps the
legacy ``climada.entity.Entity`` output as a diagnostic escape hatch.

Skipped when the real CLIMADA package is not installed (stub
environment / CI without the full geospatial stack).
``pytest.importorskip`` with ``minversion`` distinguishes the real
package from the conftest stubs, which have no ``__version__``.

The fixture file (``tests/fixtures/entities/egy_economic_present.xlsx``)
is the EGY-flood entity workbook used across the engine-backend test
suite. Tests are skipped when it is not checked out (slim CI runs).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

# Require the real CLIMADA (not the conftest stub, which has no __version__).
pytest.importorskip("climada", minversion="1.0")

from climada.entity import Entity  # noqa: E402
from entity.entity_handler import EntityHandler  # noqa: E402

from backend.engine.types import EntityBundle  # noqa: E402

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
    """Point ``DATA_ENTITIES_DIR`` at a temp dir that aliases the fixture file.

    ``EntityHandler.get_entity_from_xlsx`` resolves filenames under
    ``DATA_ENTITIES_DIR``. Redirecting that constant (in both the
    constants module and the entity-handler module that imported it at
    load time) lets the test use the bundled fixture without copying it
    into the production data dir.
    """
    fixture = tmp_path / EGY_XLSX.name
    fixture.write_bytes(EGY_XLSX.read_bytes())
    monkeypatch.setattr("constants.DATA_ENTITIES_DIR", tmp_path)
    monkeypatch.setattr("entity.entity_handler.DATA_ENTITIES_DIR", tmp_path)
    return fixture.name


class TestEngineBackendRouting:
    """``get_entity_from_xlsx`` returns the right type for each ``RISKWISE_ENGINE_BACKEND``."""

    def test_engine_backend_returns_entity_bundle(self, monkeypatch, isolated_entity_dir) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        bundle = EntityHandler().get_entity_from_xlsx(isolated_entity_dir)
        assert isinstance(bundle, EntityBundle)

    def test_climada_backend_returns_climada_entity(self, monkeypatch, isolated_entity_dir) -> None:
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        entity = EntityHandler().get_entity_from_xlsx(isolated_entity_dir)
        assert isinstance(entity, Entity)


class TestEngineClimadaParity:
    """Engine path and CLIMADA path produce equivalent values on the same fixture."""

    @pytest.fixture(autouse=True)
    def _entities(self, monkeypatch, isolated_entity_dir):
        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "climada")
        self._climada = EntityHandler().get_entity_from_xlsx(isolated_entity_dir)

        monkeypatch.setenv("RISKWISE_ENGINE_BACKEND", "engine")
        self._engine = EntityHandler().get_entity_from_xlsx(isolated_entity_dir)

    def test_exposure_value_arrays_match(self) -> None:
        """``EntityBundle.exposures.values`` matches the CLIMADA exposure values within 1e-9."""
        climada_values = self._climada.exposures.gdf["value"].to_numpy(dtype=np.float64)
        engine_values = np.asarray(self._engine.exposures.values, dtype=np.float64)
        engine_sorted = np.sort(engine_values)
        climada_sorted = np.sort(climada_values)
        np.testing.assert_allclose(engine_sorted, climada_sorted, atol=1e-9, rtol=0)

    def test_impact_function_curves_match(self) -> None:
        """``impfset_specs`` curves match ``Entity.impact_funcs`` within 1e-12."""
        impfset = self._climada.impact_funcs
        for spec in self._engine.impfset_specs:
            climada_func = impfset.get_func(haz_type=spec.haz_type, fun_id=spec.id)
            assert climada_func is not None, (
                f"CLIMADA impact_funcs has no entry for (haz_type={spec.haz_type!r}, id={spec.id})"
            )
            np.testing.assert_allclose(
                np.asarray(spec.intensity, dtype=np.float64),
                np.asarray(climada_func.intensity, dtype=np.float64),
                atol=1e-12,
                rtol=0,
            )
            np.testing.assert_allclose(
                np.asarray(spec.mdd, dtype=np.float64),
                np.asarray(climada_func.mdd, dtype=np.float64),
                atol=1e-12,
                rtol=0,
            )
            np.testing.assert_allclose(
                np.asarray(spec.paa, dtype=np.float64),
                np.asarray(climada_func.paa, dtype=np.float64),
                atol=1e-12,
                rtol=0,
            )

    def test_discount_rate_is_scalar_mean(self) -> None:
        """``EntityBundle.discount_rate`` is the arithmetic mean of CLIMADA's per-year rates."""
        rates = np.asarray(self._climada.disc_rates.rates, dtype=np.float64)
        expected = float(np.mean(rates))
        assert isinstance(self._engine.discount_rate, float)
        assert self._engine.discount_rate == pytest.approx(expected, abs=1e-12)
