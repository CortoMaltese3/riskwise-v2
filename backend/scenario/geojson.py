"""Concurrent GeoJSON generation for a scenario run.

Each generation task writes its output file through the existing handler
(so the on-disk layout downstream code relies on is unchanged) and, as it
completes, the driver emits a ``progress`` SSE event carrying the parsed
GeoJSON so the renderer can paint that layer before the other two finish.
"""

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from backend.constants import DATA_TEMP_DIR
from backend.scenario.request import RequestData


class GeoJsonGenerator:
    """Drive the exposure/hazard/impact geojson writers in parallel."""

    # Map the SSE ``step`` name to the GeoJSON file each generator writes
    # into ``DATA_TEMP_DIR``. Ordering matches the acceptance criterion but
    # the *emission* order depends on which task finishes first.
    _GEOJSON_OUTPUTS = (
        ("exposure_ready", "exposures_geodata.json"),
        ("hazard_ready", "hazards_geodata.json"),
        ("impact_ready", "risks_geodata.json"),
    )

    def __init__(
        self,
        logger: Any,
        exposure_handler: Any,
        hazard_handler: Any,
        impact_handler: Any,
        request_data: RequestData,
    ):
        self.logger = logger
        self.exposure_handler = exposure_handler
        self.hazard_handler = hazard_handler
        self.impact_handler = impact_handler
        self.request_data = request_data

    def generate(
        self,
        exposure_active: Any,
        hazard_active: Any,
        impact_active: Any,
        return_periods: tuple,
    ) -> None:
        """Generate the three scenario GeoJSONs concurrently."""
        from backend.progress import progress_callback_var

        callback = progress_callback_var.get()
        country_name = self.request_data.country_name
        asset_type = self.request_data.asset_type
        exposure_type = self.request_data.exposure_type

        def _run_exposure() -> str:
            self.logger.info(
                f"Generating exposure geojson on thread {threading.current_thread().name}",
            )
            self.exposure_handler.generate_exposure_geojson(exposure_active, country_name)
            return "exposure_ready"

        def _run_hazard() -> str:
            self.logger.info(
                f"Generating hazard geojson on thread {threading.current_thread().name}",
            )
            self.hazard_handler.generate_hazard_geojson(hazard_active, country_name, return_periods)
            return "hazard_ready"

        def _run_impact() -> str:
            self.logger.info(
                f"Generating impact geojson on thread {threading.current_thread().name}",
            )
            self.impact_handler.generate_impact_geojson(
                impact_active,
                exposure_active,
                country_name,
                return_periods,
                asset_type,
                exposure_type,
            )
            return "impact_ready"

        step_to_file = dict(self._GEOJSON_OUTPUTS)
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="geojson") as pool:
            futures = [
                pool.submit(_run_exposure),
                pool.submit(_run_hazard),
                pool.submit(_run_impact),
            ]
            for future in as_completed(futures):
                try:
                    step = future.result()
                except (
                    OSError,
                    ValueError,
                    KeyError,
                    AttributeError,
                    TypeError,
                    RuntimeError,
                ) as exc:
                    # GeoJSON generation runs CLIMADA-adjacent code in a
                    # worker thread; failures here are isolated so the
                    # other partials can still render.
                    self.logger.error(f"GeoJSON generation task failed: {exc}")
                    continue
                if callback is None:
                    continue
                path = DATA_TEMP_DIR / step_to_file[step]
                try:
                    with open(path, encoding="utf-8") as fh:
                        data = json.load(fh)
                except (OSError, ValueError) as exc:
                    self.logger.warning(f"Failed to read {step} partial from {path}: {exc}")
                    continue
                callback({"type": "progress", "step": step, "data": data})
