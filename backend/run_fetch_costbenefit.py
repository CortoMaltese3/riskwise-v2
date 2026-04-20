"""Read the persisted cost-benefit payload for the FastAPI endpoint."""

import json
from time import time

from constants import DATA_TEMP_DIR
from costben.costben_handler import COSTBEN_DATA_FILENAME
from logger_config import LoggerConfig


class RunFetchCostBenefit:
    def __init__(self) -> None:
        self.logger = LoggerConfig(logger_types=["file"])

    def run_fetch_costbenefit(self) -> dict:
        initial_time = time()
        status_code_success = 2000
        status_code_error = 4000
        empty = {
            "currency_unit": "",
            "present_year": 0,
            "future_year": 0,
            "measures": [],
        }

        path = DATA_TEMP_DIR / COSTBEN_DATA_FILENAME
        if not path.exists():
            message = "Cost-benefit data not available. Run a future scenario first."
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
                f"Fetched cost-benefit data in {time() - initial_time:.2f} sec.",
            )
            return {
                "data": payload,
                "status": {
                    "code": status_code_success,
                    "message": "Cost-benefit data fetched successfully.",
                },
            }
        except Exception as exc:
            message = f"Failed to read cost-benefit data. More info: {exc}"
            self.logger.log("error", message)
            return {
                "data": empty,
                "status": {"code": status_code_error, "message": message},
            }


if __name__ == "__main__":
    runner = RunFetchCostBenefit()
    print(json.dumps(runner.run_fetch_costbenefit()))
