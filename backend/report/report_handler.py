import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pandas as pd
import xlsxwriter

from backend.constants import DATA_TEMP_DIR, REPORTS_DIR
from backend.logger_config import LoggerConfig
from backend.provenance import REPORT_REPRODUCIBILITY_NOTE, short_sha

# ``BaseHandler`` is imported lazily inside ``__init__`` because importing it
# at module top pulls in CLIMADA (and CLIMADA's optional deps like fiona),
# which the lightweight unit tests for the Provenance tab + BibTeX helpers
# do not need and may not have installed.


def build_bibtex_snippet(app_version: Optional[str], climada_version: Optional[str]) -> str:
    """Return the BibTeX snippet stamped on every PDF and Excel export.

    The current year is captured at call time so a report regenerated in a
    new calendar year cites that year.
    """
    year = datetime.now().year
    app = app_version or "?"
    climada = climada_version or "?"
    return (
        f"@techreport{{riskwise{year},\n"
        f"  title={{RISK WISE v2 Scenario Report}},\n"
        f"  institution={{UNU-EHS / GIZ}},\n"
        f"  year={{{year}}},\n"
        f"  note={{App v{app}, CLIMADA v{climada}}}\n"
        f"}}"
    )


@dataclass
class ReportParameters:
    annual_population_growth: Optional[str] = None
    annual_gdp_growth: Optional[str] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    exposure_economic: Optional[str] = None
    exposure_non_economic: Optional[str] = None
    hazard: Optional[str] = None
    hazard_code: Optional[str] = None
    scenario: Optional[str] = None
    scenario_id: Optional[str] = None
    time_horizon: Optional[str] = None


class ReportHandler:
    def __init__(self, report_parameters: ReportParameters) -> None:
        from backend.base_handler import BaseHandler

        self.report_parameters = report_parameters
        self.target_dir = REPORTS_DIR / self.report_parameters.scenario_id or DATA_TEMP_DIR
        self.logger = LoggerConfig(logger_types=["file"])
        self.base_handler = BaseHandler()

    def get_report_file_path(self, export_type: str, report_type: str = None) -> str:
        scenario_id = self.report_parameters.scenario_id
        extension = "xlsx" if export_type == "excel" else export_type
        if export_type == "excel":
            return str(self.target_dir / f"{scenario_id}_data_report.{extension}")
        identification = ""
        if report_type:
            report_types = {
                "risk_plot_data": "risk_analysis",
                "adaptation_plot_data": "adaptation_plot",
                "exposure_map_data": "asset_data",
                "hazard_map_data": "hazard_data",
                "impact_map_data": "impact_data",
            }
            identification = report_types.get(report_type, report_type)
        return str(self.target_dir / f"{scenario_id}_{identification}.{extension}")

    def _generate_general_information_tab(self, workbook):
        ws = workbook.add_worksheet("General Information")
        ws.hide_gridlines(option=2)

        bold_20_format = workbook.add_format({"bold": True, "font_size": 20})
        bold_11_format = workbook.add_format({"bold": True, "font_size": 11})
        normal_11_format = workbook.add_format({"font_size": 11})
        italic_11_format = workbook.add_format({"italic": True, "font_size": 11, "align": "left"})
        disclaimer_format = workbook.add_format(
            {"italic": True, "font_size": 11, "align": "left", "text_wrap": True}
        )

        ws.write("B2", "Input fields", bold_20_format)
        ws.set_row(2, None, None)

        inputs = [
            ("B4", "Country", self.report_parameters.country_name),
            ("B5", "Hazard", self.report_parameters.hazard),
            ("B6", "Scenario", self.report_parameters.scenario),
            ("B7", "Time Horizon", self.report_parameters.time_horizon),
            ("B8", "Exposure of Economic Assets", self.report_parameters.exposure_economic or "-"),
            (
                "B9",
                "Exposure of Non-Economic Assets",
                self.report_parameters.exposure_non_economic or "-",
            ),
            (
                "B10",
                "Annual Population Growth",
                (
                    f"{self.report_parameters.annual_population_growth}%"
                    if self.report_parameters.annual_population_growth
                    else "-"
                ),
            ),
            (
                "B11",
                "Annual GDP Growth",
                (
                    f"{self.report_parameters.annual_gdp_growth}%"
                    if self.report_parameters.annual_gdp_growth is not None
                    else "-"
                ),
            ),
        ]

        for cell, label, value in inputs:
            ws.write(cell, label, bold_11_format)
            col_c_cell = cell.replace("B", "C")
            ws.write(col_c_cell, value, normal_11_format)

        ws.write("B14", "Report created by", bold_11_format)
        ws.write("B16", "User name", bold_11_format)
        ws.write("C16", os.getlogin(), normal_11_format)
        ws.write("B17", "Date", bold_11_format)
        ws.write("C17", datetime.now().strftime("%Y-%m-%d"), normal_11_format)
        ws.write("B18", "Time", bold_11_format)
        ws.write("C18", datetime.now().strftime("%H:%M:%S"), normal_11_format)

        ws.write("B23", "Disclaimer:", italic_11_format)

        disclaimer = (
            "The user interface has been developed by GIZ and UNU-EHS/MCII to showcase the result of Enhancing Climate Risk Assessment (ERA) "
            "for Improved Country Risk Financing Strategies and allow users to explore CLIMADA tool for conducting climate risk analysis in Egypt "
            "and Thailand.\n"
            "The user interface is free software. You can redistribute and/or modify it. The installation and use of the user interface is done at "
            "the user's discretion and risk.\n"
            "The user agrees to be solely responsible for any damage to the computer system, loss of data or any other damage resulting from "
            "installation or use of the software.\n"
            "GIZ and UNU-EHS/MCII shall not be responsible or liable for any damages arising in connection with downloading, installation, modifying "
            "or any other use of the software.\n"
            "GIZ and UNU-EHS/MCII shall assume no responsibility for any errors or other mistakes or inaccuracies in the software, in the results "
            "produced by the software or in the related documentation.\n\n"
            "License for CLIMADA:\n"
            "Copyright (C) 2017 ETH Zurich, CLIMADA contributors listed in AUTHORS. CLIMADA is free software: you can redistribute it and/or modify "
            "it under the terms of the GNU General Public License Version 3, 29 June 2007 as published by the Free Software Foundation, https://www.gnu.org/licenses/gpl-3.0.html.\n"
            "CLIMADA is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY "
            "or FITNESS FOR A PARTICULAR PURPOSE.\n"
            "See the GNU General Public License for more details: https://www.gnu.org/licenses/gpl-3.0.html."
        )

        ws.merge_range("B25:H35", disclaimer, disclaimer_format)
        ws.set_column("B:B", 40)
        ws.set_column("C:C", 60)

    def _generate_hazard_tab(self, workbook):
        hazard_df = pd.read_parquet(self.target_dir / "hazard_report_data.parquet")
        ws = workbook.add_worksheet("Hazard")
        bold_format = workbook.add_format({"bold": True})
        for col_num, value in enumerate(hazard_df.columns):
            ws.write(0, col_num, value, bold_format)
        for row_num, row_data in enumerate(hazard_df.values.tolist(), start=1):
            for col_num, cell_data in enumerate(row_data):
                ws.write(row_num, col_num, cell_data)

    def _generate_exposure_tab(self, workbook):
        exposure_df = pd.read_parquet(self.target_dir / "exposure_report_data.parquet")
        ws = workbook.add_worksheet("Exposure")
        bold_format = workbook.add_format({"bold": True})
        for col_num, value in enumerate(exposure_df.columns):
            ws.write(0, col_num, value, bold_format)
        for row_num, row_data in enumerate(exposure_df.values.tolist(), start=1):
            for col_num, cell_data in enumerate(row_data):
                ws.write(row_num, col_num, cell_data)

    def _generate_impact_tab(self, workbook):
        impact_df = pd.read_parquet(self.target_dir / "impact_report_data.parquet")
        ws = workbook.add_worksheet("Impact")
        bold_format = workbook.add_format({"bold": True})
        for col_num, value in enumerate(impact_df.columns):
            ws.write(0, col_num, value, bold_format)
        for row_num, row_data in enumerate(impact_df.values.tolist(), start=1):
            for col_num, cell_data in enumerate(row_data):
                ws.write(row_num, col_num, cell_data)

    def _generate_provenance_tab(self, workbook) -> None:
        """Write a Provenance sheet sourced from the DuckDB scenarios row (#122).

        Skips silently when the scenario id does not resolve — e.g. legacy
        report flows that bypassed the DB or unit tests that exercise the
        non-provenance tabs in isolation. The caller still gets a valid
        workbook so legacy flows do not regress.
        """
        from backend.db import get_scenario

        scenario_id = self.report_parameters.scenario_id
        if not scenario_id:
            return
        detail = get_scenario(scenario_id)
        if detail is None:
            return
        row = detail.scenario

        ws = workbook.add_worksheet("Provenance")
        ws.hide_gridlines(option=2)
        bold_20 = workbook.add_format({"bold": True, "font_size": 20})
        bold_11 = workbook.add_format({"bold": True, "font_size": 11})
        normal_11 = workbook.add_format({"font_size": 11})
        mono_11 = workbook.add_format({"font_name": "Consolas", "font_size": 11})
        wrap_11 = workbook.add_format({"font_size": 11, "text_wrap": True, "italic": True})

        ws.write("B2", "Scientific Reproducibility", bold_20)

        computed_at_str = row.computed_at.isoformat() if row.computed_at else "-"
        fields: list[tuple[str, str, object]] = [
            ("App version", row.app_version or "-", normal_11),
            ("Engine version", row.engine_version or "-", normal_11),
            ("CLIMADA version", row.climada_version or "-", normal_11),
            ("Entity data SHA-256 (8-char prefix)", short_sha(row.entity_data_sha256), mono_11),
            ("Hazard data SHA-256 (8-char prefix)", short_sha(row.hazard_data_sha256), mono_11),
            (
                "Country config SHA-256 (8-char prefix)",
                short_sha(row.country_config_sha256),
                mono_11,
            ),
            (
                "Random seed",
                str(row.random_seed) if row.random_seed is not None else "-",
                normal_11,
            ),
            ("Computed at", computed_at_str, normal_11),
        ]
        for offset, (label, value, value_fmt) in enumerate(fields):
            r = 4 + offset
            ws.write(r, 1, label, bold_11)
            ws.write(r, 2, value, value_fmt)

        note_row = 4 + len(fields) + 2
        ws.write(note_row, 1, "Reproducibility note:", bold_11)
        ws.merge_range(
            note_row + 1,
            1,
            note_row + 3,
            7,
            REPORT_REPRODUCIBILITY_NOTE,
            wrap_11,
        )

        bibtex_row = note_row + 5
        ws.write(bibtex_row, 1, "Citation (BibTeX):", bold_11)
        bibtex = build_bibtex_snippet(row.app_version, row.climada_version)
        for line_offset, line in enumerate(bibtex.splitlines()):
            ws.write(bibtex_row + 1 + line_offset, 1, line, mono_11)

        ws.set_column("B:B", 42)
        ws.set_column("C:C", 60)

    def _save_report(self, workbook):
        workbook.close()

    def generate_excel_report(self):
        report_file_path = self.get_report_file_path(export_type="excel")
        workbook = xlsxwriter.Workbook(filename=report_file_path)
        self._generate_general_information_tab(workbook)
        self._generate_hazard_tab(workbook)
        self._generate_exposure_tab(workbook)
        self._generate_impact_tab(workbook)
        self._generate_provenance_tab(workbook)
        self._save_report(workbook)
