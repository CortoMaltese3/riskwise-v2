"""Country-name sanitization and ISO3 lookup helpers.

Both functions wrap ``pycountry.countries.search_fuzzy`` and translate its
``LookupError`` failures into the conventions the rest of the backend
expects: ``sanitize_country_name`` raises a ``ValueError`` on miss (the
caller treats unsanitizable names as a hard request error), while
``get_iso3_country_code`` returns ``None`` (the caller falls back to the
raw name when the ISO3 form is unavailable).
"""

from __future__ import annotations

import pycountry

from backend.logging_config import get_logger

logger = get_logger("backend.utils.country")


def sanitize_country_name(country_name: str) -> str:
    """Return the canonical pycountry name for ``country_name``.

    :param country_name: Free-form country name from the UI payload.
    :return: The standardized pycountry name.
    :raises ValueError: If no fuzzy match exists.
    """
    try:
        country = pycountry.countries.search_fuzzy(country_name)[0]
        return country.name
    except LookupError as exception:
        logger.error(
            f"Error while trying to sanitize country name. More info: {exception}",
        )
        raise ValueError(
            f"Failed to sanitize country: {country_name}. More info: {exception}"
        ) from exception


def get_iso3_country_code(country_name: str) -> str | None:
    """Return the ISO3 code for ``country_name`` or ``None`` on miss.

    :param country_name: Free-form or canonical country name.
    :return: The ISO 3166-1 alpha-3 code, or ``None`` when the lookup fails.
    """
    try:
        country = pycountry.countries.search_fuzzy(country_name)[0]
        return country.alpha_3
    except LookupError:
        logger.error(f"No ISO3 code found for '{country_name}'. Please check the country name.")
        return None
    except (AttributeError, TypeError, ValueError) as exc:
        logger.error(
            f"An error occurred while trying to convert country name to iso3. More info: {exc}",
        )
        return None
