"""Country-specific configuration loader.

Versioned ``countries/<ISO3>/config.json`` files hold the scientific
constants (discount rate, per-sector annual growth rates, per-hazard
return periods) that ERA scenario runs previously hardcoded in
``backend/run_scenario.py``. See ``docs/DECISIONS.md`` § D14 for the
rationale.
"""

from .loader import CountryConfig, CountryConfigError, load_country_config

__all__ = ["CountryConfig", "CountryConfigError", "load_country_config"]
