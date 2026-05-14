"""Module to handle checking data types availability in the CLIMADA API."""

from time import time

from backend.cli import Command, StatusCode
from backend.progress import update_progress
from backend.utils.country import sanitize_country_name
from backend.utils.data_check import check_data_type


class RunCheckDataType(Command):
    """Check whether the CLIMADA API offers a given data type for a country."""

    def __init__(self, request):
        super().__init__()
        self.request = request

    def execute(self) -> dict:
        initial_time = time()

        if not self.valid_request():
            run_status_message = "Invalid request: Missing required fields"
            self.logger.error(run_status_message)
            return {
                "data": {"data": {}},
                "status": {
                    "code": StatusCode.VALIDATION_ERROR,
                    "message": run_status_message,
                },
            }

        country_name = self.request.get("country", "")
        country_name = sanitize_country_name(country_name)
        data_type = self.request.get("dataType", "")

        update_progress(10, "Checking CLIMADA API")
        is_valid_data_type = check_data_type(country_name, data_type)

        if not is_valid_data_type:
            run_status_message = (
                f"No datasets available for {data_type} in {country_name} in CLIMADA's API."
            )
            status_code = StatusCode.VALIDATION_ERROR
        else:
            run_status_message = f"Fetched {data_type} data successfully."
            status_code = StatusCode.SUCCESS

        update_progress(100, run_status_message)

        self.logger.info(f"Finished fetching {data_type} data in {time() - initial_time}sec."
        )
        return {
            "data": {"data": {}},
            "status": {"code": status_code, "message": run_status_message},
        }

    def error_envelope(self, exc):
        return {
            "data": {"data": {}},
            "status": {
                "code": StatusCode.ERROR,
                "message": f"An unexpected error occurred. More info: {exc}",
            },
        }

    def valid_request(self) -> bool:
        for field in ("country", "dataType"):
            if field not in self.request:
                self.logger.error(f"Missing required field: {field}")
                return False
        return True

    def run_check_data_type(self) -> dict:
        return self.run()


if __name__ == "__main__":
    import json

    print(json.dumps(RunCheckDataType.main()))
