"""Fetch macroeconomic chart data for the FastAPI endpoint."""

from time import time

from backend.base_handler import BaseHandler
from backend.cli import Command, StatusCode
from backend.macroeconomic.macroeconomic_handler import MacroeconomicHandler

_EMPTY_CHART = {"years": [], "datasets": [], "title": ""}


class RunFetchMacroChartData(Command):
    def __init__(self, request):
        super().__init__()
        self.base_handler = BaseHandler()
        self.macro_handler = MacroeconomicHandler()
        self.request = request

        self.country_name = str(request.get("countryName", "")).strip()
        self.scenario = str(request.get("scenario", "")).strip()
        self.sector = str(request.get("sector", "")).strip()
        self.macro_variable = str(request.get("variable", "")).strip()
        dataset_id = request.get("dataset_id")
        self.dataset_id = str(dataset_id).strip() if dataset_id else None

    def valid_request(self) -> bool:
        for field in ("countryName", "scenario", "sector", "variable"):
            if not self.request.get(field):
                self.logger.log("error", f"Missing required field: {field}")
                return False
        return True

    def execute(self) -> dict:
        initial_time = time()
        if not self.valid_request():
            return self.error_envelope("Invalid request: missing required fields")
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
                "status": {
                    "code": StatusCode.SUCCESS,
                    "message": "Macroeconomic chart data fetched successfully.",
                },
            }
        except (OSError, ValueError, KeyError, RuntimeError) as e:
            self.logger.log("error", f"An error occurred: {str(e)}")
            return self.error_envelope(
                f"An error occurred fetching macro chart data. More info: {e}"
            )

    def error_envelope(self, exc):
        return {
            "data": dict(_EMPTY_CHART),
            "status": {"code": StatusCode.ERROR, "message": str(exc)},
        }

    def run_fetch_macro_chart_data(self) -> dict:
        return self.run()


if __name__ == "__main__":
    RunFetchMacroChartData.main()
