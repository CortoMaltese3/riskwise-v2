"""Scenario runner package.

The runner orchestrates a scenario end-to-end: data loading (via a
:class:`ScenarioDataStrategy`), cost-benefit analysis, impact calculation,
and generation of the map-data artifacts the frontend consumes.

Public surface re-exported here for convenience; importers may also reach
the individual submodules directly.
"""

from backend.scenario.request import RequestData, _filter_entity_measures
from backend.scenario.runner import RunScenario
from backend.scenario.strategy import (
    CustomDataStrategy,
    EraDataStrategy,
    ScenarioDataStrategy,
    make_strategy,
)

__all__ = [
    "CustomDataStrategy",
    "EraDataStrategy",
    "RequestData",
    "RunScenario",
    "ScenarioDataStrategy",
    "_filter_entity_measures",
    "make_strategy",
]
