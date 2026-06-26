"""Administrative-boundary GeoJSON loader.

Reads ``gadm{level}_{ISO3}.geojson`` from the requirements bundle and
returns a normalized :class:`geopandas.GeoDataFrame`. Returns ``None``
when the file is missing or unparseable so callers can degrade gracefully
(the spatial-join code paths skip layers that come back empty).
"""

from __future__ import annotations

import geopandas as gpd

from backend.constants import REQUIREMENTS_DIR
from backend.logging_config import get_logger

logger = get_logger("backend.utils.admin")


def available_admin_levels(country_code: str, max_level: int = 5) -> list[int]:
    """Return the admin levels (0..``max_level``) that ship a GADM file for ``country_code``.

    Admin-level support is data-driven: a country exposes whatever
    ``gadm{level}_{ISO3}.geojson`` files are present under the requirements
    bundle. This lets a country pack add finer levels (e.g. Greece ships
    ADM3 municipalities) without the handlers hardcoding a fixed level set,
    and degrades gracefully for countries that only ship ADM0–2.
    """
    return [
        level
        for level in range(max_level + 1)
        if (REQUIREMENTS_DIR / f"gadm{level}_{country_code}.geojson").is_file()
    ]


def get_admin_data(country_code: str, admin_level: int) -> gpd.GeoDataFrame | None:
    """Return the normalized admin GeoDataFrame, or ``None`` on failure."""
    try:
        file_path = REQUIREMENTS_DIR / f"gadm{admin_level}_{country_code}.geojson"
        admin_gdf = gpd.read_file(file_path)
        admin_gdf = admin_gdf[["shapeName", "shapeID", "shapeGroup", "geometry"]]
        return admin_gdf.rename(
            columns={
                "shapeID": "id",
                "shapeName": "name",
                "shapeGroup": "country",
            }
        )
    except FileNotFoundError:
        logger.error(f"File not found: gadm{admin_level}_{country_code}.geojson")
        return None
    except (OSError, ValueError, KeyError, AttributeError) as exception:
        logger.error(
            f"An error occured while trying to get country admin level information. "
            f"More info: {exception}",
        )
        return None
