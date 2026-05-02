import json
from time import time

from backend.base_handler import BaseHandler
from backend.logger_config import LoggerConfig
from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler


class RunFetchCredOutput:
    def __init__(self, dataset_id: str | None = None):
        self.base_handler = BaseHandler()
        self.logger = LoggerConfig(logger_types=["file"])
        self.macro_handler = MacroeconomicHandler()
        self.dataset_id = dataset_id if dataset_id else None

    def run_fetch_cred_output(self) -> dict:
        initial_time = time()
        try:
            cred_data = self.macro_handler.get_cred_data_from_db(dataset_id=self.dataset_id)
            self.base_handler.update_progress(100, "CRED data fetched successfully.")
            self.logger.log(
                "info",
                f"Finished fetching CRED data in {time() - initial_time:.2f} sec.",
            )
            return {
                "data": cred_data,
                "status": {"code": 2000, "message": "CRED output data fetched successfully."},
            }
        except Exception as e:
            self.logger.log("error", f"An error occurred: {str(e)}")
            return {
                "data": [],
                "status": {
                    "code": 4000,
                    "message": f"An error occurred while fetching CRED output. More info: {str(e)}",
                },
            }


if __name__ == "__main__":
    import sys

    ds = sys.argv[1] if len(sys.argv) > 1 else None
    runner = RunFetchCredOutput(dataset_id=ds)
    resp = runner.run_fetch_cred_output()
    print(json.dumps(resp))
