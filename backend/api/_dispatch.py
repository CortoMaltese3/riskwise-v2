"""Legacy ``run_*.py`` script dispatcher used by router endpoints via ``backend.app``.

Each ``run_*.py`` script is a thin façade over a CLIMADA call; this module
maps script filenames to their façade classes so the FastAPI handlers can
keep their bodies short. Imports are lazy so importing this module does
not pull in CLIMADA. Re-exported from :mod:`backend.app` as
``_dispatch_sync`` for backwards compatibility with the test patches.
"""

from __future__ import annotations

from typing import Any


def _dispatch_sync(script_name: str, data: Any) -> dict:
    if script_name == "run_check_data_type.py":
        from backend.run_check_data_type import RunCheckDataType

        return RunCheckDataType(data).run_check_data_type()
    if script_name == "run_fetch_measures.py":
        from backend.run_fetch_measures import RunFetchScenario

        return RunFetchScenario(data).run_fetch_measures()
    if script_name == "run_clear_temp_dir.py":
        from backend.run_clear_temp_dir import RunClearTempDir

        return RunClearTempDir().run_clear_temp_dir()
    if script_name == "run_fetch_macro_chart_data.py":
        from backend.run_fetch_macro_chart_data import RunFetchMacroChartData

        return RunFetchMacroChartData(data).run_fetch_macro_chart_data()
    if script_name == "run_fetch_cred_output.py":
        from backend.run_fetch_cred_output import RunFetchCredOutput

        ds = None
        if isinstance(data, dict):
            ds = data.get("dataset_id")
        return RunFetchCredOutput(dataset_id=ds).run_fetch_cred_output()
    if script_name == "run_fetch_waterfall.py":
        from backend.run_fetch_waterfall import RunFetchWaterfall

        return RunFetchWaterfall().run_fetch_waterfall()
    if script_name == "run_fetch_costbenefit.py":
        from backend.run_fetch_costbenefit import RunFetchCostBenefit

        return RunFetchCostBenefit().run_fetch_costbenefit()
    raise ValueError(f"Unknown script: {script_name}")
