"""Fetch CRED output data from the database for the FastAPI endpoint."""

import json
import sys
from time import time

from backend.base_handler import BaseHandler
from backend.cli import Command, StatusCode
from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler


class RunFetchCredOutput(Command):
    requires_request = False

    def __init__(self, dataset_id: str | None = None):
        super().__init__()
        self.base_handler = BaseHandler()
        self.macro_handler = MacroeconomicHandler()
        self.dataset_id = dataset_id if dataset_id else None

    def execute(self) -> dict:
        initial_time = time()
        try:
            cred_data = self.macro_handler.get_cred_data_from_db(dataset_id=self.dataset_id)
            self.base_handler.update_progress(100, "CRED data fetched successfully.")
            self.logger.info(f"Finished fetching CRED data in {time() - initial_time:.2f} sec.",
            )
            return {
                "data": cred_data,
                "status": {
                    "code": StatusCode.SUCCESS,
                    "message": "CRED output data fetched successfully.",
                },
            }
        except (OSError, ValueError, KeyError, RuntimeError) as e:
            self.logger.error(f"An error occurred: {str(e)}")
            return {
                "data": [],
                "status": {
                    "code": StatusCode.ERROR,
                    "message": f"An error occurred while fetching CRED output. More info: {str(e)}",
                },
            }

    def error_envelope(self, exc):
        return {
            "data": [],
            "status": {
                "code": StatusCode.ERROR,
                "message": f"An error occurred while fetching CRED output. More info: {exc}",
            },
        }

    def run_fetch_cred_output(self) -> dict:
        return self.run()


if __name__ == "__main__":
    ds = sys.argv[1] if len(sys.argv) > 1 else None
    runner = RunFetchCredOutput(dataset_id=ds)
    print(json.dumps(runner.run()))
