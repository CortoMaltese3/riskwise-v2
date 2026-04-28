"""Local catalog of riskwise-shipped datasets.

Replaces ``climada.util.api_client.Client`` for the
"is dataset X available for country Y?" question. CLIMADA's API client
went over HTTP to the CLIMADA hub; we ship every dataset the app needs
inside ``data/``, so the same question becomes a static lookup over
``data/catalog.json``.

Locked decision #4 from
:doc:`../../docs/spikes/adr-climate-lama-engine-adoption` is the source
of truth for this swap. The catalog also documents what's bundled so a
release engineer can spot a missing file at build time instead of at
scenario-run time.

JSON schema
-----------
``data/catalog.json`` is a single object with these top-level fields::

    {
      "version": 1,
      "hazards":  [<HazardEntry>, ...],
      "entities": [<EntityEntry>, ...],
      "measures": [<MeasureEntry>, ...]
    }

* ``HazardEntry``  — ``{"country", "hazard", "scenario", "path"}``.
  ``country`` is an ISO-3 code; ``hazard`` is the CLIMADA peril code
  ("FL", "D", "HW"); ``scenario`` is "historical" or an RCP id
  ("rcp26"…); ``path`` is repo-relative.
* ``EntityEntry``  — ``{"country", "hazard", "exposure_type", "path"}``.
  ``exposure_type`` matches ``request_data.exposure_type`` (e.g.
  "crops", "students").
* ``MeasureEntry`` — ``{"path", "scope"}``. ``scope`` is "all" for the
  global adaptation-measures workbook.

The machine-readable schema lives at
``tests/fixtures/catalog_schema.json`` and is validated in
``tests/unit/engine/test_catalog.py``.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from constants import BASE_DIR

__all__ = ["CatalogError", "is_dataset_available", "load_catalog"]


_CATALOG_PATH = BASE_DIR / "data" / "catalog.json"


class CatalogError(RuntimeError):
    """Raised when ``data/catalog.json`` is missing or malformed."""


@lru_cache(maxsize=1)
def load_catalog(path: Path | None = None) -> dict[str, Any]:
    """Read and cache ``data/catalog.json``.

    The default cache is a process-wide singleton keyed on the default
    path. Tests that point at a fixture catalog should pass an explicit
    ``path`` and call :func:`load_catalog.cache_clear` between cases so
    one fixture's contents do not leak into the next.
    """
    target = Path(path) if path is not None else _CATALOG_PATH
    if not target.is_file():
        raise CatalogError(f"Catalog file not found: {target}")
    try:
        with target.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"Cannot parse catalog at {target}: {exc}") from exc
    if not isinstance(data, dict):
        raise CatalogError(f"Catalog at {target} must be a JSON object, got {type(data).__name__}")
    return data


def is_dataset_available(country: str, hazard: str) -> bool:
    """Return ``True`` when the catalog ships hazard *and* entity data for the pair.

    A scenario needs both a hazard raster/HDF5 and at least one entity
    workbook to run end to end, so "available" means both are present —
    a hazard file with no matching entity, or vice versa, returns
    ``False``. Inputs are normalised to upper-case so callers can pass
    ``"egy"`` / ``"fl"`` interchangeably with ``"EGY"`` / ``"FL"``.
    """
    catalog = load_catalog()
    country_u = country.upper()
    hazard_u = hazard.upper()

    has_hazard = any(
        entry.get("country", "").upper() == country_u
        and entry.get("hazard", "").upper() == hazard_u
        for entry in catalog.get("hazards", [])
    )
    if not has_hazard:
        return False

    has_entity = any(
        entry.get("country", "").upper() == country_u
        and entry.get("hazard", "").upper() == hazard_u
        for entry in catalog.get("entities", [])
    )
    return has_entity
