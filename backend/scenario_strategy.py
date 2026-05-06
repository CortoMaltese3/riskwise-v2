"""Scenario data-loading strategies for ERA and custom modes.

Before this refactor, ``RunScenario`` duplicated the compute pipeline across
``_run_era_scenario`` and ``_run_custom_scenario``; only the data-acquisition
steps actually differed. The strategies here encapsulate that divergence so
the rest of the pipeline lives in one place.

Two concrete strategies:

- :class:`EraDataStrategy` loads entity/hazard from the country-keyed
  predefined seed files (``countries/<ISO3>/...``).
- :class:`CustomDataStrategy` loads entity/hazard from user-uploaded files,
  falling back to the ERA historical hazard file when the user uploads only
  a future-scenario hazard. Runs that supply no upload raise ``ValueError``
  directing the user to the custom-data import flow.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import replace
from typing import Any


class ScenarioDataStrategy(ABC):
    """Protocol for loading the entity, exposure, and hazard objects a run needs.

    Concrete implementations own *what* to load and *from where*. The common
    post-load shaping (future entity, growth rates, ref years) lives in the
    scenario runner, keeping that code path identical across modes.
    """

    # Progress messages differ between modes (see the "predefined" vs "custom"
    # wording in the v1 UI). Strategies override with mode-appropriate copy.
    entity_progress_message: str = "Setting up Entity objects..."
    exposure_progress_message: str = "Setting up Exposure objects..."
    hazard_progress_message: str = "Setting up Hazard objects..."
    cost_benefit_progress_message: str = "Conducting cost-benefit analysis..."
    impact_progress_message: str = "Setting up Impact objects..."

    @abstractmethod
    def load_entity_and_exposure(
        self,
        request_data: Any,
        entity_handler: Any,
        exposure_handler: Any,
    ) -> tuple[Any, Any]:
        """Load the present-day entity and exposure objects as an ``(entity, exposure)`` pair."""

    @abstractmethod
    def load_hazard_present(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        """Load the present-day hazard object."""

    @abstractmethod
    def load_hazard_future(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        """Load the future-scenario hazard object."""


class EraDataStrategy(ScenarioDataStrategy):
    """Load entity/hazard from the ERA seed files keyed by country and hazard."""

    entity_progress_message = "Setting up Entity objects from predefined entity file..."
    exposure_progress_message = "Setting up Exposure objects from predefined datasets..."
    hazard_progress_message = "Setting up Hazard objects from predefined datasets..."
    cost_benefit_progress_message = (
        "Conducting cost-benefit analysis based on predefined datasets..."
    )
    impact_progress_message = "Setting up Impact objects from predefined datasets..."

    def load_entity_and_exposure(
        self,
        request_data: Any,
        entity_handler: Any,
        exposure_handler: Any,
    ) -> tuple[Any, Any]:
        filename = entity_handler.get_entity_filename(
            request_data.country_code,
            request_data.hazard_code,
            request_data.exposure_type,
        )
        entity = entity_handler.get_entity_from_xlsx(filename)
        return entity, entity.exposures

    def load_hazard_present(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        filename = hazard_handler.get_hazard_filename(
            request_data.hazard_code,
            request_data.country_code,
            "historical",
        )
        hazard = hazard_handler.get_hazard(
            hazard_type=request_data.hazard_type,
            filepath=filename,
        )
        return replace(hazard, intensity_unit=hazard_intensity_unit)

    def load_hazard_future(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        filename = hazard_handler.get_hazard_filename(
            request_data.hazard_code,
            request_data.country_code,
            request_data.scenario,
        )
        hazard = hazard_handler.get_hazard(
            hazard_type=request_data.hazard_type,
            filepath=filename,
        )
        return replace(hazard, intensity_unit=hazard_intensity_unit)


_MISSING_UPLOAD_MSG = (
    "Custom scenarios require an uploaded dataset. "
    "Upload the file via the custom-data import flow before running the scenario."
)


class CustomDataStrategy(ScenarioDataStrategy):
    """Load entity/hazard from user-uploaded files.

    When the user uploads only a future-scenario hazard file but asks for a
    non-historical run, the *historical* hazard still falls back to the ERA
    seed file for that country.
    """

    entity_progress_message = "Setting up Entity objects from custom datasets..."
    exposure_progress_message = "Setting up Exposure objects from custom datasets..."
    hazard_progress_message = "Setting up Hazard objects from custom datasets..."
    cost_benefit_progress_message = "Conducting cost-benefit analysis based on custom datasets..."
    impact_progress_message = "Setting up Impact objects from custom datasets..."

    def load_entity_and_exposure(
        self,
        request_data: Any,
        entity_handler: Any,
        exposure_handler: Any,
    ) -> tuple[Any, Any]:
        if request_data.entity_filename:
            entity = entity_handler.get_entity_from_xlsx(request_data.entity_filename)
            return entity, entity.exposures
        raise ValueError(_MISSING_UPLOAD_MSG)

    def load_hazard_present(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        if not request_data.hazard_filename:
            raise ValueError(_MISSING_UPLOAD_MSG)
        file_type = base_handler.check_file_type(request_data.hazard_filename)
        if request_data.scenario == "historical":
            hazard = hazard_handler.get_hazard(
                hazard_type=request_data.hazard_type,
                filepath=request_data.hazard_filename,
                source=file_type,
            )
        else:
            historical_filename = hazard_handler.get_hazard_filename(
                request_data.hazard_code,
                request_data.country_code,
                "historical",
            )
            hazard = hazard_handler.get_hazard(
                hazard_type=request_data.hazard_type,
                filepath=historical_filename,
            )
        return replace(hazard, intensity_unit=hazard_intensity_unit)

    def load_hazard_future(
        self,
        request_data: Any,
        hazard_handler: Any,
        base_handler: Any,
        hazard_intensity_unit: str,
    ) -> Any:
        if not request_data.hazard_filename:
            raise ValueError(_MISSING_UPLOAD_MSG)
        file_type = base_handler.check_file_type(request_data.hazard_filename)
        hazard = hazard_handler.get_hazard(
            hazard_type=request_data.hazard_type,
            filepath=request_data.hazard_filename,
            source=file_type,
        )
        return replace(hazard, intensity_unit=hazard_intensity_unit)


def make_strategy(is_era: bool) -> ScenarioDataStrategy:
    """Return the strategy matching the request mode."""
    return EraDataStrategy() if is_era else CustomDataStrategy()
