"""Read the persisted waterfall payload for the FastAPI endpoint."""

import json
from time import time

from backend.cli import Command, StatusCode
from backend.constants import DATA_TEMP_DIR
from backend.costben.costben_handler import WATERFALL_DATA_FILENAME


class RunFetchWaterfall(Command):
    requires_request = False

    def error_envelope(self, exc):
        # ``data`` is None (not the old empty-dict sentinel) because
        # ``WaterfallPayload.categories`` enforces ``min_length=4``.
        return {
            "data": None,
            "status": {
                "code": StatusCode.ERROR,
                "message": f"Failed to read waterfall data. More info: {exc}",
            },
        }

    def execute(self) -> dict:
        initial_time = time()

        # ``data`` is None (not the old empty-dict sentinel) because
        # ``WaterfallPayload.categories`` enforces ``min_length=4``. Returning
        # an empty list there would trip Pydantic response validation and
        # surface as a 500 to the renderer instead of the intended graceful
        # "no waterfall yet" status. The frontend already handles
        # ``status.code != 2000`` and a missing payload.
        path = DATA_TEMP_DIR / WATERFALL_DATA_FILENAME
        if not path.exists():
            message = "Waterfall data not available. Run a future scenario first."
            self.logger.log("info", message)
            return {
                "data": None,
                "status": {"code": StatusCode.ERROR, "message": message},
            }

        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
        self.logger.log(
            "info",
            f"Fetched waterfall data in {time() - initial_time:.2f} sec.",
        )
        return {
            "data": payload,
            "status": {
                "code": StatusCode.SUCCESS,
                "message": "Waterfall data fetched successfully.",
            },
        }

    def run_fetch_waterfall(self) -> dict:
        return self.run()


if __name__ == "__main__":
    RunFetchWaterfall.main()
