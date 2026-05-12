import { useTranslation } from "react-i18next";

import RiskWiseClient from "../lib/RiskWiseClient";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";

import outputIconTha from "../assets/folder_grey_network_icon_512.png";
import outputIconEgy from "../assets/folder_grey_cloud_icon_512.png";

// Backend stores the pycountry canonical title-case name ("Egypt", "Thailand"),
// but every other consumer of ``selectedCountry`` in the store (i18n keys, the
// hazard map country-coordinates lookup, the per-country output icons) expects
// the lowercase slug. Use this for any country value coming back from the API.
const countrySlug = (value) => (value || "").toLowerCase();

const toReport = (row) => {
  const country = countrySlug(row.country);
  const fallbackTitle = [
    row.name || row.id,
    row.country,
    row.hazard_type,
    row.scenario,
    row.future_year,
  ]
    .filter(Boolean)
    .join(" - ");
  return {
    id: row.id,
    scenarioId: row.id,
    data: [
      row.country,
      row.hazard_type,
      row.scenario,
      row.exposure_type || "",
      `${row.ref_year ?? ""},${row.future_year ?? ""}`,
      row.annual_growth ?? "",
    ]
      .filter((v) => v !== null && v !== undefined && v !== "")
      .join(" - "),
    params: {
      annual_growth: row.annual_growth,
      country_name: row.country,
      exposure_type: row.exposure_type,
      asset_type: row.asset_type,
      future_year: row.future_year,
      hazard_type: row.hazard_type,
      is_era: row.is_era,
      ref_year: row.ref_year,
      scenario: row.scenario,
    },
    image: country === "thailand" ? outputIconTha : outputIconEgy,
    title: row.name || fallbackTitle,
    type: "output_data",
    name: row.name,
    tags: row.tags,
    notes: row.notes,
    createdAt: row.created_at,
  };
};

export const useReportTools = () => {
  const { t } = useTranslation();
  const {
    reports,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setMapTitle,
    setSelectedReport,
    setReports,
  } = useUIStore.getState();
  const { setIsScenarioRunCompleted } = useResultsStore.getState();
  const {
    setSelectedAppOption,
    setSelectedCountry,
    setSelectedHazard,
    setSelectedScenario,
    setSelectedExposure,
    setSelectedExposureCategory,
    setSelectedTimeHorizon,
    setSelectedAnnualGrowth,
    setIsValidHazard,
    setIsValidExposure,
    setScenarioRunCode,
    setSelectedScenarioRunCode,
    setScenarioRunSaved,
  } = useWorkspaceStore.getState();

  const fetchReports = async () => {
    try {
      const response = await RiskWiseClient.listScenarios();
      const { data, status } = response.result;

      if (status.code === 2000) {
        const mapped = data.map(toReport);
        setReports(mapped);
      } else {
        setAlertMessage(`${"alert_message_report_tools_error_fetch_reports"}: ${status.message}`);
        setAlertSeverity("error");
        setAlertShowMessage(true);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      setAlertMessage(t("alert_message_report_tools_error_fetch_reports"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
    }
  };

  const getReport = (id) => {
    return reports.find((report) => report.id === id) || null;
  };

  const restoreScenario = async (id) => {
    try {
      const response = await RiskWiseClient.getScenario(id);
      const { data, status } = response.result;
      if (status.code !== 2000 || !data) {
        throw new Error(`Failed to fetch scenario ${id}`);
      }

      const scenario = data.scenario;
      setSelectedReport(toReport(scenario));

      // Rehydrate the per-run temp directory *before* flipping the
      // run-completed flag. The maps and the waterfall/cost-benefit charts
      // re-fetch as soon as that flag flips, so the blobs must already be
      // on disk or the renderer paints the empty state.
      const hydrateResponse = await RiskWiseClient.hydrateScenarioTemp(id);
      if (!hydrateResponse?.success || hydrateResponse?.result?.status?.code !== 2000) {
        throw new Error(`Failed to hydrate temp dir for scenario ${id}`);
      }

      setSelectedAppOption(scenario.is_era ? "era" : "custom");
      setScenarioRunCode(id);
      setScenarioRunSaved(true);
      setSelectedScenarioRunCode(id);
      setSelectedCountry(countrySlug(scenario.country));
      setSelectedHazard(scenario.hazard_type);
      setIsValidHazard(true);
      setSelectedScenario(scenario.scenario);
      setMapTitle(scenario.name || scenario.id);

      if (scenario.exposure_type) {
        setSelectedExposure(scenario.exposure_type);
        setSelectedExposureCategory(scenario.asset_type ?? null);
        setIsValidExposure(true);
      }

      setSelectedTimeHorizon([scenario.ref_year, scenario.future_year]);
      setSelectedAnnualGrowth(scenario.annual_growth ?? 0);
      setIsScenarioRunCompleted(true);
      return true;
    } catch (error) {
      console.error("Error restoring scenario:", error);
      setAlertMessage(t("alert_message_report_tools_error_restore_report"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
      return false;
    }
  };

  const reportExists = (reportId) => {
    return reports.some((r) => r && r.id === reportId);
  };

  return {
    fetchReports,
    restoreScenario,
    reportExists,
    getReport,
    toReport,
  };
};
