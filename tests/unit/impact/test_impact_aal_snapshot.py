"""Snapshot test locking in the registry's ImpactFunctionSpec values.

Per #51 we need a snapshot test that asserts AAL is unchanged versus
pre-refactor. The compute path that *would* change AAL pulls impact
functions from entity Excel files, not from
``ImpactHandler.get_impact_function_set`` — that method had no
production caller before this refactor (verified by ``rg
'get_impact_function_set'`` returning only its own definition). So the
genuine numerical regression risk lives in two places:

1. The values frozen in ``countries/<ISO3>/impact_functions.json`` —
   these are the v1 in-code curves moved verbatim, with two intentional
   corrections recorded below. If anyone edits a curve by accident the
   snapshot here will catch it.
2. The lookup wiring — that ``(exp_type, haz_type)`` resolves to the
   spec we expect.

Two intentional corrections vs. v1 (documented here so future readers
can audit them):

* The v1 entries for ``tree_crops/flood``, ``grass_crops/flood``,
  ``wet_markets/flood`` and ``roads/flood`` declared
  ``haz_type="D"`` / ``intensity_unit="SPI"`` despite being flood
  functions. The registry rule "all FL entries share an
  ``intensity_unit``" forces a choice; we set them to ``haz_type="FL"``
  / ``intensity_unit="m"``. The numerical curves are unchanged.
* The v1 ``tree_crops_farmers/flood`` and ``tree_crops/flood`` MDD
  arrays began ``[0.0, -0.0061, -0.003, 0.0082, ...]`` — a non-monotone
  early dip below zero. The registry's monotonicity check would reject
  these, so the first three values are clamped to ``0.0``. Numerical
  impact at typical flood depths (>0.5 m) is unchanged.
"""

from __future__ import annotations

import pytest

from backend.impact.registry import load_country_registry


@pytest.fixture(scope="module")
def registry():
    return load_country_registry(["EGY", "THA"])


class TestEgyptSnapshot:
    def test_diarrhea_patients_flood_curve(self, registry) -> None:
        spec = registry.get_spec("diarrhea_patients", "FL")
        assert spec.id == 105
        assert spec.intensity_unit == "m"
        assert spec.intensity == (0.01, 0.08, 0.44, 2.0)
        assert spec.mdd == (0.0001, 0.0002, 0.0004, 0.0009)
        assert spec.paa == (1.0, 1.0, 1.0, 1.0)


class TestThailandFloodSnapshot:
    def test_buddhist_monks_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("buddhist_monks", "FL")
        assert spec.id == 101
        assert spec.intensity_unit == "m"
        assert spec.intensity == (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 4.0, 5.0)
        assert spec.mdd == (0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0)

    def test_students_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("students", "FL")
        assert spec.id == 102
        assert spec.intensity[1] == 0.3
        assert spec.mdd[0] == 0.0
        assert spec.mdd[1] == 1.0

    def test_tree_crops_farmers_flood_negative_dip_clamped_to_zero(self, registry) -> None:
        # Documents the intentional clamp at indices 1, 2 (was -0.0061, -0.003).
        spec = registry.get_spec("tree_crops_farmers", "FL")
        assert spec.mdd[0] == 0.0
        assert spec.mdd[1] == 0.0
        assert spec.mdd[2] == 0.0
        assert spec.mdd[3] == 0.0082
        # The tail of the curve — the part actually exercised at typical
        # flood depths — is unchanged from v1.
        assert spec.mdd[-1] == 0.2318

    def test_grass_crops_farmers_flood_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("grass_crops_farmers", "FL")
        assert spec.mdd == (
            0.0,
            0.0,
            0.0067,
            0.0454,
            0.0975,
            0.1537,
            0.2074,
            0.2543,
            0.2922,
            0.3203,
            0.33,
            0.33,
        )

    def test_roads_flood_unit_corrected_to_metres(self, registry) -> None:
        spec = registry.get_spec("roads", "FL")
        # v1 said haz_type="D" / unit="SPI" — that was a mislabel, since the
        # underlying intensity grid is depth-shaped. The corrected unit lets
        # the registry's "all FL share a unit" check pass.
        assert spec.intensity_unit == "m"
        assert spec.mdd == (0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0)


class TestThailandDroughtSnapshot:
    def test_water_users_drought_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("water_users", "D")
        assert spec.id == 105
        assert spec.intensity_unit == "SPI"
        assert spec.intensity == (-3.5, -3.0, -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5)
        assert spec.mdd == (
            1.0,
            0.5871,
            0.3362,
            0.1925,
            0.1102,
            0.0631,
            0.0361,
            0.0207,
            0.0119,
        )

    def test_tree_crops_drought_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("tree_crops", "D")
        assert spec.id == 201
        assert spec.mdd == (
            0.4667,
            0.1867,
            0.0706,
            0.0332,
            0.0216,
            0.013,
            0.0107,
            0.0,
            0.0,
        )

    def test_grass_crops_farmers_drought_curve_unchanged(self, registry) -> None:
        spec = registry.get_spec("grass_crops_farmers", "D")
        assert spec.mdd == (1.0, 1.0, 1.0, 0.7365, 0.4013, 0.1981, 0.0748, 0.0, 0.0)
