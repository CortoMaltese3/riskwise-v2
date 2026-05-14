import { useCallback } from "react";

import RiskWiseClient from "../lib/RiskWiseClient";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { SCENARIO_PHASES } from "../store/scenarioPhases";
import { TABS } from "../components/main/tabs";

// Centralised scenario-run dispatch shared between the global Run button on
// the Risk view and the Adaptation view's Apply measure-selection button.
// The hook owns the alert / map / applied-selection plumbing so two callers
// do not drift.
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

  const setIsScenarioRunning = useResultsStore((s) => s.setIsScenarioRunning);
  const setIsScenarioRunCompleted = useResultsStore((s) => s.setIsScenarioRunCompleted);
  const setScenarioPhase = useResultsStore((s) => s.setScenarioPhase);
  const setActiveRunSummary = useResultsStore((s) => s.setActiveRunSummary);

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
      // Snapshot the inputs that drive the chip's summary line at dispatch
      // so the user can navigate the workspace freely mid-run without
      // changing what the chip says is running. ``landingTab`` rides along
      // so the post-run "View results" link knows which tab to jump to.
      const [timeHorizonStart, timeHorizonEnd] = Array.isArray(selectedTimeHorizon)
        ? selectedTimeHorizon
        : [selectedTimeHorizon, selectedTimeHorizon];
      setActiveRunSummary({
        country: selectedCountry,
        hazard: selectedHazard,
        timeHorizonStart,
        timeHorizonEnd,
        landingTab,
      });
      setIsScenarioRunning(true);
      setScenarioPhase(SCENARIO_PHASES.RUNNING);
      setSelectedReport(null);
      return RiskWiseClient.runScenario(body)
        .then((response) => {
          setIsScenarioRunning(false);
          if (!response.success) {
            setError(response.error);
            setScenarioPhase(SCENARIO_PHASES.FAILED);
            return { success: false, response };
          }
          setAlertMessage(response.result.status.message);
          const succeeded = response.result.status.code === 2000;
          setAlertSeverity(succeeded ? "success" : "error");
          setAlertShowMessage(true);
          if (succeeded) {
            markMeasureSelectionApplied(appliedMeasureIds ?? []);
          }
          setMapTitle(response.result.data.mapTitle);
          setScenarioRunCode(response.result.data.scenarioId);
          setIsScenarioRunCompleted(true);
          setScenarioPhase(succeeded ? SCENARIO_PHASES.COMPLETED : SCENARIO_PHASES.FAILED);
          if (typeof onSuccess === "function") {
            onSuccess(response);
          }
          return { success: true, response };
        })
        .catch((error) => {
          setIsScenarioRunning(false);
          setScenarioPhase(SCENARIO_PHASES.FAILED);
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
      setActiveRunSummary,
      setAlertMessage,
      setAlertSeverity,
      setAlertShowMessage,
      setError,
      setIsScenarioRunCompleted,
      setIsScenarioRunning,
      setScenarioPhase,
      setMapTitle,
      setScenarioRunCode,
      setSelectedReport,
    ]
  );

  return { runScenario };
};

export default useRunScenario;
