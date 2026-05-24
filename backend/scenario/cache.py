"""Computation cache for scenario runs.

The cache is keyed on the scenario-identity tuple (country, hazard, etc.)
plus the SHA-256 of the on-disk entity/hazard files. On a hit, the bundled
result blobs are written back into ``DATA_TEMP_DIR`` so the rest of the
pipeline picks up exactly as if the run had just completed.
"""

from typing import Any

import duckdb

from backend.constants import DATA_ENTITIES_DIR, DATA_HAZARDS_DIR, DATA_TEMP_DIR
from backend.db import cache_store
from backend.db.scenario_store import RESULT_TYPE_TO_TEMP_FILE
from backend.progress import update_progress
from backend.provenance import sha256_file
from backend.scenario.request import RequestData


class RunCache:
    """Derive a cache key, restore a hit, or store a fresh run's outputs."""

    # Reuse the shared mapping so the cache restore writes the exact filenames
    # the downstream persistence / report steps expect.
    _CACHE_TEMP_FILES = RESULT_TYPE_TO_TEMP_FILE

    def __init__(self, logger: Any):
        self.logger = logger

    def derive_key(self, request_data: RequestData) -> str | None:
        """Hash the scenario-identity tuple for the computation cache.

        Returns ``None`` when either input file is absent on disk — we
        cannot key a cache entry on content we cannot hash, and a missing
        file means the run is about to fail anyway.
        """
        entity_path = DATA_ENTITIES_DIR / request_data.entity_filename
        hazard_path = DATA_HAZARDS_DIR / request_data.hazard_filename
        if not entity_path.is_file() or not hazard_path.is_file():
            return None
        try:
            entity_sha = sha256_file(entity_path)
            hazard_sha = sha256_file(hazard_path)
        except OSError:
            return None
        return cache_store.derive_cache_key(
            country=request_data.country_name,
            hazard_type=request_data.hazard_type,
            scenario=request_data.scenario,
            exposure_type=request_data.exposure_type,
            ref_year=request_data.ref_year,
            future_year=request_data.future_year,
            annual_growth=request_data.annual_growth,
            entity_sha256=entity_sha,
            hazard_sha256=hazard_sha,
            selected_measure_ids=request_data.selected_measure_ids,
        )

    def restore(self, cache_key: str) -> bool:
        """Hydrate the temp dir from a cached bundle. Returns ``True`` on hit."""
        try:
            raw = cache_store.get(cache_key)
        except (duckdb.Error, OSError, ValueError) as exc:
            self.logger.warning(f"Computation-cache lookup failed: {exc}")
            return False
        if not raw:
            return False
        try:
            bundle = cache_store.decode_bundle(raw)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            self.logger.warning(f"Computation-cache decode failed: {exc}")
            return False
        DATA_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        wrote_any = False
        for result_type, filename in self._CACHE_TEMP_FILES.items():
            blob = bundle.get(result_type)
            if blob is None:
                continue
            (DATA_TEMP_DIR / filename).write_bytes(blob)
            wrote_any = True
        if not wrote_any:
            return False
        update_progress(100, "Scenario run successfully (cache hit).")
        self.logger.info(f"Computation-cache hit for key {cache_key[:12]}...")
        return True

    def store(self, cache_key: str) -> None:
        """Persist the just-produced temp-dir blobs under ``cache_key``."""
        bundle: dict[str, bytes] = {}
        for result_type, filename in self._CACHE_TEMP_FILES.items():
            path = DATA_TEMP_DIR / filename
            if path.is_file():
                bundle[result_type] = path.read_bytes()
        if not bundle:
            return
        try:
            cache_store.put(cache_key, "scenario_bundle", cache_store.encode_bundle(bundle))
        except (duckdb.Error, OSError, ValueError) as exc:
            self.logger.warning(f"Computation-cache write failed: {exc}")
