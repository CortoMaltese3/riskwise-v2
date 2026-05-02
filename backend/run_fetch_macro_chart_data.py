import json
import sys
from time import time

from backend.base_handler import BaseHandler
from backend.logger_config import LoggerConfig
from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler


class RunFetchMacroChartData:
    def __init__(self, request):
        self.base_handler = BaseHandler()
        self.macro_handler = MacroeconomicHandler()
        self.logger = LoggerConfig(logger_types=["file"])
        self.request = request

        self.country_name = str(request.get("countryName", "")).strip()
        self.scenario = str(request.get("scenario", "")).strip()
        self.sector = str(request.get("sector", "")).strip()
        self.macro_variable = str(request.get("variable", "")).strip()
        dataset_id = request.get("dataset_id")
        self.dataset_id = str(dataset_id).strip() if dataset_id else None

    def valid_request(self) -> bool:
        for field in ["countryName", "scenario", "sector", "variable"]:
            if not self.request.get(field):
                self.logger.log("error", f"Missing required field: {field}")
                return False
        return True

    def run_fetch_macro_chart_data(self) -> dict:
        initial_time = time()
        if not self.valid_request():
            return {
                "data": {"years": [], "datasets": [], "title": ""},
                "status": {"code": 4000, "message": "Invalid request: missing required fields"},
            }
        try:
            chart = self.macro_handler.get_chart_data(
                country=self.country_name,
                scenario=self.scenario,
                sector=self.sector,
                variable=self.macro_variable,
                dataset_id=self.dataset_id,
            )
            title = self.base_handler.set_macroeconomic_chart_title(
                self.country_name, self.macro_variable
            )
            self.base_handler.update_progress(100, "Data fetched successfully.")
            self.logger.log(
                "info",
                f"Finished fetching macro chart data in {time() - initial_time:.2f} sec.",
            )
            return {
                "data": {"years": chart["years"], "datasets": chart["datasets"], "title": title},
                "status": {"code": 2000, "message": "Macroeconomic chart data fetched successfully."},
            }
        except Exception as e:
            self.logger.log("error", f"An error occurred: {str(e)}")
            return {
                "data": {"years": [], "datasets": [], "title": ""},
                "status": {
                    "code": 4000,
                    "message": f"An error occurred fetching macro chart data. More info: {str(e)}",
                },
            }


if __name__ == "__main__":
    req = json.loads(sys.argv[1])
    runner = RunFetchMacroChartData(req)
    resp = runner.run_fetch_macro_chart_data()
    print(json.dumps(resp))
