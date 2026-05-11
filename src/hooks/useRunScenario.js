import { useCallback } from "react";

import RiskWiseClient from "../lib/RiskWiseClient";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

// Centralised scenario-run dispatch shared between the global Run button on
// the Risk view (issue #1 original flow) and the Adaptation view's Apply
// measure-selection button (issue #373). The hook owns the alert / map /
// applied-selection plumbing so two callers do not drift.
const useRunScenario = () => {
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureCategory = useWorkspaceStore((s) => s.selectedExposureCategory);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedHazardFile = useWorkspaceStore((s) => s.selectedHazardFile);
  const selectedScenario = useWorkspaceStore((s) => s.selectedScenario);
  const selectedTimeHorizon = useWorkspaceStore((s) => s.selectedTimeHorizon);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const isMeasureSelectionInitialized = useWorkspaceStore((s) => s.isMeasureSelectionInitialized);
  const markMeasureSelectionApplied = useWorkspaceStore((s) => s.markMeasureSelectionApplied);
  const setScenarioRunCode = useWorkspaceStore((s) => s.setScenarioRunCode);

  const setMapTitle = useUIStore((s) => s.setMapTitle);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const setError = useUIStore((s) => s.setError);
  const setSelectedReport = useUIStore((s) => s.setSelectedReport);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);

  const setIsScenarioRunning = useResultsStore((s) => s.setIsScenarioRunning);
  const setIsScenarioRunCompleted = useResultsStore((s) => s.setIsScenarioRunCompleted);

  const runScenario = useCallback(
    ({ landingTab = TABS.RISK, onSuccess } = {}) => {
      const body = {
        annualGrowth: selectedAnnualGrowth,
        countryName: selectedCountry,
        assetType: selectedExposureCategory ?? "economic",
        exposureType: selectedExposure,
        exposureFile: selectedExposureFile,
        hazardType: selectedHazard,
        isEra: selectedAppOption === "era",
        hazardFile: selectedHazardFile,
        scenario: selectedScenario,
        timeHorizon: selectedTimeHorizon,
      };
      const appliedMeasureIds = isMeasureSelectionInitialized ? [...selectedMeasureIds] : null;
      if (appliedMeasureIds !== null) {
        body.selectedMeasureIds = appliedMeasureIds;
      }
      setIsScenarioRunning(true);
      setSelectedReport(null);
      return RiskWiseClient.runScenario(body)
        .then((response) => {
          setIsScenarioRunning(false);
          if (!response.success) {
            setError(response.error);
            return { success: false, response };
          }
          setAlertMessage(response.result.status.message);
          response.result.status.code === 2000
            ? setAlertSeverity("success")
            : setAlertSeverity("error");
          setAlertShowMessage(true);
          if (response.result.status.code === 2000) {
            markMeasureSelectionApplied(appliedMeasureIds ?? []);
          }
          setMapTitle(response.result.data.mapTitle);
          setScenarioRunCode(response.result.data.scenarioId);
          setIsScenarioRunCompleted(true);
          if (landingTab) {
            setSelectedTab(landingTab);
          }
          if (typeof onSuccess === "function") {
            onSuccess(response);
          }
          return { success: true, response };
        })
        .catch((error) => {
          setIsScenarioRunning(false);
          setError({
            code: "renderer_error",
            message: error?.message || "Unexpected failure in renderer",
            detail: null,
            error_id: crypto.randomUUID(),
          });
          return { success: false, error };
        });
    },
    [
      selectedAnnualGrowth,
      selectedCountry,
      selectedExposureCategory,
      selectedExposure,
      selectedExposureFile,
      selectedHazard,
      selectedAppOption,
      selectedHazardFile,
      selectedScenario,
      selectedTimeHorizon,
      selectedMeasureIds,
      isMeasureSelectionInitialized,
      markMeasureSelectionApplied,
      setAlertMessage,
      setAlertSeverity,
      setAlertShowMessage,
      setError,
      setIsScenarioRunCompleted,
      setIsScenarioRunning,
      setMapTitle,
      setScenarioRunCode,
      setSelectedReport,
      setSelectedTab,
    ]
  );

  return { runScenario };
};

export default useRunScenario;
