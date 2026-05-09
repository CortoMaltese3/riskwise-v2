"""Module for exporting reports based on scenario data."""

from time import time

from backend.base_handler import BaseHandler
from backend.cli import Command, StatusCode
from backend.hazard.hazard_handler import HazardHandler
from backend.report.report_handler import ReportHandler, ReportParameters


def _build_report_parameters(
    base_handler: BaseHandler, hazard_handler: HazardHandler, scenario_code: str
) -> ReportParameters:
    meta = base_handler.get_scenario_metadata(scenario_code)
    asset_type = meta.get("asset_type")
    return ReportParameters(
        country_code=base_handler.get_iso3_country_code(meta.get("country_name")),
        country_name=meta.get("country_name"),
        hazard=meta.get("hazard_type"),
        hazard_code=hazard_handler.get_hazard_code(meta.get("hazard_type")),
        scenario=meta.get("scenario"),
        scenario_id=scenario_code,
        time_horizon=f"{meta.get('ref_year')} - {meta.get('future_year')}",
        exposure_type=meta.get("exposure_type"),
        asset_type=asset_type,
        annual_population_growth=meta.get("annual_growth") if asset_type == "economic" else None,
        annual_gdp_growth=meta.get("annual_growth") if asset_type == "non_economic" else None,
    )


class RunExportReport(Command):
    """Generate scenario reports (Excel / Word / PDF) for the FastAPI endpoint."""

    def __init__(self, request):
        super().__init__()
        self.base_handler = BaseHandler()
        self.hazard_handler = HazardHandler()
        self.request = request

    def valid_request(self) -> bool:
        for field in ("exportType", "scenarioRunCode"):
            if field not in self.request:
                self.logger.log("error", f"Missing required field: {field}")
                return False
        return True

    def _generate(self, handler, export_type, report_type, scenario_code, report_id):
        """Dispatch on ``export_type`` and return ``(file_path, status_message)``."""
        if export_type == "excel":
            self.base_handler.update_progress(30, "Generating excel report...")
            path = handler.get_report_file_path(export_type)
            handler.generate_excel_report()
            return path, "Generated excel report successfully."
        if export_type in ("word", "pdf"):
            self.base_handler.update_progress(30, f"Generating {export_type} report...")
            path = handler.get_report_file_path(export_type, report_type)
            generator = (
                handler.generate_word_report
                if export_type == "word"
                else handler.generate_pdf_report
            )
            generator(report_type, scenario_code, report_id)
            return path, f"Generated {export_type} report successfully."
        return None, f"Unsupported export type: {export_type}"

    def execute(self) -> dict:
        initial_time = time()
        run_status_message = ""
        try:
            if not self.valid_request():
                run_status_message = "Invalid request: Missing required fields"
                self.logger.log("error", run_status_message)
                return self._envelope("", StatusCode.VALIDATION_ERROR, run_status_message)

            scenario_code = self.request.get("scenarioRunCode", "")
            report = self.request.get("report") or {}
            self.base_handler.update_progress(20, "Setting up report parameters...")
            handler = ReportHandler(
                _build_report_parameters(self.base_handler, self.hazard_handler, scenario_code)
            )
            path, run_status_message = self._generate(
                handler,
                self.request.get("exportType", ""),
                report.get("type"),
                scenario_code,
                report.get("id"),
            )
            if path is None:
                return self._envelope("", StatusCode.VALIDATION_ERROR, run_status_message)
            return self._envelope(str(path), StatusCode.SUCCESS, run_status_message)
        except (OSError, ValueError, KeyError, RuntimeError, AttributeError, TypeError) as e:
            run_status_message = f"An error occurred: {str(e)}"
            self.logger.log("error", run_status_message)
            return self._envelope("", StatusCode.ERROR, run_status_message)
        finally:
            self.logger.log("info", f"Finished generating report in {time() - initial_time}sec.")
            self.base_handler.update_progress(100, run_status_message)

    @staticmethod
    def _envelope(path: str, code: StatusCode, message: str) -> dict:
        return {"data": {"report_path": path}, "status": {"code": code, "message": message}}

    def error_envelope(self, exc):
        return self._envelope("", StatusCode.ERROR, f"An error occurred: {exc}")

    def run_export_report(self) -> dict:
        return self.run()


if __name__ == "__main__":
    RunExportReport.main()
