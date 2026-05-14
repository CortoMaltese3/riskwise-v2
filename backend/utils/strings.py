"""Display-string formatters for hazards, scenarios, assets, macro variables.

These are the human-readable labels that flow into map titles, chart
titles, and report tabs. They have no I/O dependencies and are safe to
import from any layer.
"""

from __future__ import annotations

_HAZARD_LABELS: dict[str, str] = {
    "tropical_cyclone": "Tropical cyclone",
    "storm_europe": "Storm Europe",
    "river_flood": "River flood",
    "drought": "Drought",
    "flood": "Flood",
    "heatwaves": "Heatwaves",
}

_SCENARIO_LABELS: dict[str, str] = {
    "rcp26": "RCP 2.6",
    "rcp45": "RCP 4.5d",
    "rcp60": "RCP 6.0",
    "rcp85": "RCP 8.5",
    "historical": "historical",
}

_MACRO_VARIABLE_LABELS: dict[str, str] = {
    "gdp": "GDP",
    "employment": "Employment",
    "consumption": "Consumption",
    "capital_stock": "Capital stock",
    "damage": "Damage, loss of productivity, and destruction of capital",
}

_ASSET_LABELS: dict[str, str] = {
    "crops": "Crops",
    "livestock": "Livestock",
    "power_plants": "Power Plants",
    "hotels": "Hotels",
    "hospitalised_people": "Hospitalized people",
    "students": "Students",
    "diarrhea_patients": "Diarrhea Patients",
    "roads": "Road Users",
    "tree_crops": "Tree Crops",
    "grass_crops": "Grass Crops",
    "wet_markets": "Wet Markets",
    "grass_crops_farmers": "Grass Crops Farmers",
    "tree_crops_farmers": "Tree Crops Farmers",
    "buddhist_monks": "Buddhist Monks",
}


def beautify_hazard_type(hazard_type: str) -> str:
    """Return the display label for ``hazard_type``; falls back to ``"Hazard"``."""
    return _HAZARD_LABELS.get(hazard_type, "Hazard")


def beautify_scenario(scenario: str) -> str:
    """Return the display label for ``scenario``; empty string for unknowns."""
    return _SCENARIO_LABELS.get(scenario, "")


def beautify_macro_variable(macro_variable: str) -> str:
    """Return the display label for a macroeconomic variable.

    :raises ValueError: When ``macro_variable`` is empty.
    :raises KeyError: When the variable is not in the registered set
        (callers rely on this to surface unsupported variables loudly).
    """
    if not macro_variable:
        raise ValueError("Macro variable cannot be empty.")
    return _MACRO_VARIABLE_LABELS[macro_variable]


def beautify_asset(asset: str) -> str:
    """Return the display label for ``asset``; empty string for unknowns.

    :raises ValueError: When ``asset`` is empty.
    """
    if not asset:
        raise ValueError("Assets cannot be empty.")
    return _ASSET_LABELS.get(asset, "")


def set_map_title(hazard_type: str, country: str, time_horizon: str, scenario: str) -> str:
    """Build the map title for the scenario panel."""
    hazard_beautified = beautify_hazard_type(hazard_type)
    country_beautified = country.capitalize()
    scenario_beautified = beautify_scenario(scenario)

    if scenario == "historical":
        return (
            f"{hazard_beautified} risk analysis for {country_beautified} "
            f"in {time_horizon} {scenario_beautified} scenario."
        )
    return (
        f"{hazard_beautified} risk analysis for {country_beautified} "
        f"in {time_horizon} (scenario {scenario_beautified})."
    )


def set_macroeconomic_chart_title(country_name: str, macro_variable: str) -> str:
    """Build the title shown above macroeconomic charts.

    :raises ValueError: When either argument is empty or the macro variable
        is not in the registered set.
    """
    if not country_name or not macro_variable:
        raise ValueError("Both country_name and macro_variable must be provided.")

    country_beautified = country_name.capitalize()
    macro_variable_beautified = beautify_macro_variable(macro_variable)

    if not macro_variable_beautified:
        raise ValueError(f"Invalid macro variable: {macro_variable}")

    return f"{country_beautified} projected {macro_variable_beautified}"
