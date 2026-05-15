import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import RiskWiseClient from "../lib/RiskWiseClient";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { SCENARIO_PHASES } from "../store/scenarioPhases";
import { TABS } from "../components/main/tabs";

// Centralised scenario-run dispatch for the global Run button on the Risk
// view. The hook owns the alert / map / skipped-measure plumbing in one place
// so the wire format and post-run side effects stay consistent.
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
  const impactFunctionOverride = useWorkspaceStore((s) => s.impactFunctionOverride);
  const setLastRunSkippedMeasures = useWorkspaceStore((s) => s.setLastRunSkippedMeasures);
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
  const setActiveRunImpactFunction = useResultsStore((s) => s.setActiveRunImpactFunction);
  const setActiveRunImpactFunctionOverride = useResultsStore(
    (s) => s.setActiveRunImpactFunctionOverride
  );
  const clearImpactFunctionOverride = useWorkspaceStore((s) => s.clearImpactFunctionOverride);

  const { t } = useTranslation();

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
      // Snapshot the selection at dispatch so a post-dispatch store edit
      // can't leak into the in-flight body.
      const dispatchedMeasureIds = [...selectedMeasureIds];
      body.selectedMeasureIds = dispatchedMeasureIds;
      // Snapshot the IF override (#453). Only attach the field if there
      // is one to send so ERA-mode runs (which forbid it on the server)
      // stay clean even if a stale override lingers in the store.
      const dispatchedOverride =
        impactFunctionOverride && selectedAppOption !== "era"
          ? { ...impactFunctionOverride }
          : null;
      if (dispatchedOverride) {
        body.impactFunctionOverride = dispatchedOverride;
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
        exposure: selectedExposure,
        mode: selectedAppOption,
        exposureFile: selectedExposureFile,
        timeHorizonStart,
        timeHorizonEnd,
        landingTab,
        // Filled in below once the impact-function lookup returns. Kept on
        // the summary so the ``ResultsView`` secondary entry point can open
        // the impact-function dialog for the run that just completed (#452).
        impactFunction: null,
        // Carries the override the run was dispatched with so the
        // ResultsView "Modified" badge shows for this run (#453).
        impactFunctionOverride: dispatchedOverride,
      });
      // Mirror via the dedicated setter so callers that read directly
      // from useResultsStore can rely on a stable update path even if
      // the summary shape changes later.
      setActiveRunImpactFunctionOverride(dispatchedOverride);
      // Fire-and-forget IF lookup so the ``ResultsView`` secondary entry
      // point can open the dialog without a re-fetch. A failed lookup is
      // non-fatal — the button hides when ``impactFunction`` is missing —
      // so we don't gate the run on it. ``?.`` defends against the older
      // mocks across the suite that only stub ``runScenario``.
      RiskWiseClient.fetchImpactFunction?.(
        selectedCountry,
        selectedHazard,
        selectedExposure,
        selectedAppOption === "explore" ? selectedExposureFile : null
      )?.then((response) => {
        if (response?.success) setActiveRunImpactFunction(response.result.data);
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
          const succeeded = response.result.status.code === 2000;
          // Surface the backend's silent measure-filter as a warning
          // snackbar so users see when the engine dropped some of their
          // selected measures (issue #450). The warning replaces the
          // success message because the more interesting signal is the
          // skipped count, not "run succeeded".
          const skippedNames = Array.isArray(response.result.data?.skippedMeasures)
            ? response.result.data.skippedMeasures
            : [];
          if (succeeded) {
            setLastRunSkippedMeasures(skippedNames);
            // The override has now been applied to the run that just
            // completed. Clear the pending workspace state so the next
            // scenario starts from the canonical curve unless the user
            // explicitly edits again (issue #453).
            if (dispatchedOverride) {
              clearImpactFunctionOverride();
            }
          }
          if (succeeded && skippedNames.length > 0) {
            setAlertMessage(
              t("scenario_run_skipped_measures_snackbar", {
                count: skippedNames.length,
                total: dispatchedMeasureIds.length,
              })
            );
            setAlertSeverity("warning");
          } else {
            setAlertMessage(response.result.status.message);
            setAlertSeverity(succeeded ? "success" : "error");
          }
          setAlertShowMessage(true);
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
      impactFunctionOverride,
      setLastRunSkippedMeasures,
      setActiveRunSummary,
      setActiveRunImpactFunction,
      setActiveRunImpactFunctionOverride,
      clearImpactFunctionOverride,
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
      t,
    ]
  );

  return { runScenario };
};

export default useRunScenario;
