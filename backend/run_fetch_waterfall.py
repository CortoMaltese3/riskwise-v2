"""Read the persisted waterfall payload for the FastAPI endpoint."""

import json
from time import time

from backend.constants import DATA_TEMP_DIR
from backend.costben.costben_handler import WATERFALL_DATA_FILENAME
from backend.logger_config import LoggerConfig


class RunFetchWaterfall:
    def __init__(self) -> None:
        self.logger = LoggerConfig(logger_types=["file"])

    def run_fetch_waterfall(self) -> dict:
        initial_time = time()
        status_code_success = 2000
        status_code_error = 4000
        empty = {
            "present_year": 0,
            "future_year": 0,
            "measurement_unit": "",
            "categories": [],
        }

        path = DATA_TEMP_DIR / WATERFALL_DATA_FILENAME
        if not path.exists():
            message = "Waterfall data not available. Run a future scenario first."
            self.logger.log("info", message)
            return {
                "data": empty,
                "status": {"code": status_code_error, "message": message},
            }

        try:
            with open(path, encoding="utf-8") as fh:
                payload = json.load(fh)
            self.logger.log(
                "info",
                f"Fetched waterfall data in {time() - initial_time:.2f} sec.",
            )
            return {
                "data": payload,
                "status": {
                    "code": status_code_success,
                    "message": "Waterfall data fetched successfully.",
                },
            }
        except Exception as exc:
            message = f"Failed to read waterfall data. More info: {exc}"
            self.logger.log("error", message)
            return {
                "data": empty,
                "status": {"code": status_code_error, "message": message},
            }


if __name__ == "__main__":
    runner = RunFetchWaterfall()
    print(json.dumps(runner.run_fetch_waterfall()))
