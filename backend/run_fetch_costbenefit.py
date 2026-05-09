"""Read the persisted cost-benefit payload for the FastAPI endpoint."""

import json
from time import time

from backend.cli import Command, StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.costben.costben_handler import COSTBEN_DATA_FILENAME


class RunFetchCostBenefit(Command):
    requires_request = False

    _EMPTY_DATA = {
        "currency_unit": "",
        "present_year": 0,
        "future_year": 0,
        "measures": [],
    }

    def error_envelope(self, exc):
        return {
            "data": dict(self._EMPTY_DATA),
            "status": {
                "code": StatusCode.ERROR,
                "message": f"Failed to read cost-benefit data. More info: {exc}",
            },
        }

    def execute(self) -> dict:
        initial_time = time()

        path = DATA_TEMP_DIR / COSTBEN_DATA_FILENAME
        if not path.exists():
            message = "Cost-benefit data not available. Run a future scenario first."
            self.logger.info(message)
            return {
                "data": dict(self._EMPTY_DATA),
                "status": {"code": StatusCode.ERROR, "message": message},
            }

        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
        self.logger.info(f"Fetched cost-benefit data in {time() - initial_time:.2f} sec.",
        )
        return {
            "data": payload,
            "status": {
                "code": StatusCode.SUCCESS,
                "message": "Cost-benefit data fetched successfully.",
            },
        }

    # Backwards-compatible method name kept so app.py and any external
    # caller that imports ``run_fetch_costbenefit`` continue to work.
    def run_fetch_costbenefit(self) -> dict:
        return self.run()


if __name__ == "__main__":
    print(json.dumps(RunFetchCostBenefit.main()))
