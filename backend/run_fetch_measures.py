"""Fetch adaptation measure names for a given hazard type from DuckDB."""

from __future__ import annotations

import json
import sys
from time import time

from costben.costben_handler import CostBenefitHandler
from db.connection import get_connection, resolve_db_path
from hazard.hazard_handler import HazardHandler
from logger_config import LoggerConfig

from base_handler import BaseHandler


class RunFetchScenario:
    def __init__(self, request: dict):
        self.base_handler = BaseHandler()
        self.costben_handler = CostBenefitHandler()
        self.hazard_handler = HazardHandler()
        self.logger = LoggerConfig(logger_types=["file"])
        self.request = request

    def valid_request(self) -> bool:
        if "hazardType" not in self.request:
            self.logger.log("error", "Missing required field: hazardType")
            return False
        return True

    def run_fetch_measures(self) -> dict:
        initial_time = time()

        if not self.valid_request():
            return {
                "data": {"adaptationMeasures": []},
                "status": {"code": 4000, "message": "Invalid request: Missing required fields"},
            }

        hazard_type = self.request.get("hazardType", "")
        measure_set_id: str | None = self.request.get("measureSetId")
        hazard_code = self.hazard_handler.get_hazard_code(hazard_type)
        hazard_beautified = self.base_handler.beautify_hazard_type(hazard_type)

        self.base_handler.update_progress(10, "Fetching adaptation measures...")

        conn = get_connection(resolve_db_path())
        try:
            adaptation_measures = self.costben_handler.get_measure_names_from_db(
                conn, hazard_code, measure_set_id
            )
        finally:
            conn.close()

        if not hazard_code or not adaptation_measures:
            status_code = 3000
            run_status_message = f"No available adaptation measures for {hazard_beautified}."
        else:
            status_code = 2000
            run_status_message = (
                f"Fetched adaptation measures for {hazard_beautified} successfully."
            )

        self.base_handler.update_progress(100, run_status_message)
        self.logger.log(
            "info",
            f"Finished fetching adaptation measures data in {time() - initial_time:.2f}sec.",
        )
        return {
            "data": {"adaptationMeasures": adaptation_measures},
            "status": {"code": status_code, "message": run_status_message},
        }


if __name__ == "__main__":
    req = json.loads(sys.argv[1])
    runner = RunFetchScenario(req)
    resp = runner.run_fetch_measures()
    print(json.dumps(resp))
