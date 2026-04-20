"""Regression test for the previously-broken ``hazard_intensity_unit`` path.

Before #49, ``RunScenario._run_custom_scenario`` defined
``hazard_intensity_unit`` only inside the *if* branch (user-uploaded entity
xlsx). The else branch (CLIMADA-API exposure fetch) left it undefined, so any
downstream ``hazard_present.units = hazard_intensity_unit`` raised NameError
and was silently funnelled into a generic 3000 status.

The fix routes both branches through ``RunScenario._resolve_hazard_intensity_unit``,
which returns ``""`` when no entity is loaded. This test exercises both paths
of that helper directly (the previously-broken else-branch is the
``entity is None`` case).
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


@pytest.fixture
def runner():
    """Build a ``RunScenario`` skeleton without running its heavy ``__init__``.

    The CLIMADA / ``pycountry`` / handler imports pulled in transitively by
    ``run_scenario`` are stubbed by ``tests/unit/conftest.py``.
    """
    from run_scenario import RunScenario

    instance = RunScenario.__new__(RunScenario)
    instance.hazard_handler = MagicMock()
    return instance


class TestResolveHazardIntensityUnit:
    def test_none_entity_returns_empty_string_no_handler_call(self, runner) -> None:
        # The previously-broken else-branch: no entity uploaded → no impact
        # function to read a unit from. Empty string is the safe default and
        # matches ``HazardHandler.get_hazard_intensity_units_from_entity``'s
        # own ``impf.intensity_unit or ""`` fallback.
        assert runner._resolve_hazard_intensity_unit(None) == ""
        runner.hazard_handler.get_hazard_intensity_units_from_entity.assert_not_called()

    def test_entity_delegates_to_hazard_handler(self, runner) -> None:
        runner.hazard_handler.get_hazard_intensity_units_from_entity.return_value = "m"
        entity = object()
        assert runner._resolve_hazard_intensity_unit(entity) == "m"
        runner.hazard_handler.get_hazard_intensity_units_from_entity.assert_called_once_with(entity)
