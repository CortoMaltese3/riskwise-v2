import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";

import RiskWiseClient from "../../lib/RiskWiseClient";
import SaveScenarioDialog from "../workspace/SaveScenarioDialog";
import { useReportTools } from "../../utils/reportTools";
import useStore from "../../store";
import useWorkspaceStore from "../../store/workspaceSlice";

const RunScenarioButton = () => {
  const { t } = useTranslation();
  const {
    isValidExposure,
    isValidHazard,
    setMapTitle,
    setIsScenarioRunning,
    selectedCountry,
    selectedAnnualGrowth,
    selectedAppOption,
    selectedExposure,
    selectedExposureCategory,
    selectedExposureFile,
    selectedHazard,
    selectedHazardFile,
    selectedScenario,
    selectedTimeHorizon,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setError,
    setIsScenarioRunCompleted,
    setScenarioRunCode,
    setSelectedReport,
    setSelectedTab,
  } = useStore();

  const [isRunButtonLoading, setIsRunButtonLoading] = useState(false);
  const [isRunButtonDisabled, setIsRunButtonDisabled] = useState(true);
  const [saveDialog, setSaveDialog] = useState({ open: false, id: null, name: "" });
  const { fetchReports } = useReportTools();
  const reloadWorkspaceScenarios = useWorkspaceStore((s) => s.loadScenarios);

  const handleRunButton = () => {
    if (
      selectedCountry &&
      selectedHazard &&
      selectedScenario &&
      selectedExposure &&
      isValidHazard &&
      isValidExposure
    ) {
      setIsRunButtonDisabled(false);
    } else {
      setIsRunButtonDisabled(true);
    }
  };

  useEffect(() => {
    handleRunButton();
  }, [
    selectedCountry,
    selectedAnnualGrowth,
    selectedAppOption,
    selectedExposure,
    selectedExposureFile,
    selectedHazard,
    selectedHazardFile,
    selectedScenario,
    selectedTimeHorizon,
  ]);

  const onRunHandler = () => {
    const body = {
      annualGrowth: selectedAnnualGrowth,
      countryName: selectedCountry,
      // Custom uploads with no category default to "economic" so the engine's
      // display rounding stays consistent.
      assetType: selectedExposureCategory ?? "economic",
      exposureType: selectedExposure,
      exposureFile: selectedExposureFile,
      hazardType: selectedHazard,
      isEra: selectedAppOption === "era",
      hazardFile: selectedHazardFile,
      scenario: selectedScenario,
      timeHorizon: selectedTimeHorizon,
    };
    setIsRunButtonDisabled(true);
    setIsRunButtonLoading(true);
    setIsScenarioRunning(true);
    setSelectedReport(null);
    RiskWiseClient.runScenario(body)
      .then((response) => {
        setIsRunButtonLoading(false);
        setIsRunButtonDisabled(false);
        setIsScenarioRunning(false);
        if (!response.success) {
          setError(response.error);
          return;
        }
        setAlertMessage(response.result.status.message);
        response.result.status.code === 2000
          ? setAlertSeverity("success")
          : setAlertSeverity("error");
        setAlertShowMessage(true);
        setMapTitle(response.result.data.mapTitle);
        setScenarioRunCode(response.result.data.scenarioId);
        setIsScenarioRunCompleted(true);
        // Land the user on the analysis tab so the map/chart toggle and the
        // newly-generated geodata are visible the moment the save dialog
        // closes. Without this they stay on selectedTab=0 (Input Selection)
        // and only see the toggle after navigating away and back.
        setSelectedTab(1);
        if (response.result.data.scenarioId) {
          setSaveDialog({
            open: true,
            id: response.result.data.scenarioId,
            name: response.result.data.mapTitle || "",
          });
        }
      })
      .catch((error) => {
        setIsRunButtonLoading(false);
        setIsRunButtonDisabled(false);
        setIsScenarioRunning(false);
        setError({
          code: "renderer_error",
          message: error?.message || "Unexpected failure in renderer",
          detail: null,
          error_id: crypto.randomUUID(),
        });
      });
  };

  return (
    <Box sx={{ textAlign: "center", mt: 2 }} data-tour="run-button">
      <SaveScenarioDialog
        open={saveDialog.open}
        scenarioId={saveDialog.id}
        defaultName={saveDialog.name}
        onClose={() => setSaveDialog((s) => ({ ...s, open: false }))}
        onSaved={() => {
          fetchReports();
          reloadWorkspaceScenarios({ force: true });
        }}
      />
      {!isRunButtonLoading ? (
        <Button
          key="runButton"
          disabled={isRunButtonDisabled}
          onClick={onRunHandler}
          startIcon={<PlayCircleIcon />}
          sx={{
            bgcolor: "secondary.main",
            "&:hover": { bgcolor: "secondary.light" },
          }}
          variant="contained"
        >
          {t("run_button")}
        </Button>
      ) : (
        <LoadingButton
          loading={isRunButtonLoading}
          loadingPosition="center"
          color="secondary"
          variant="contained"
        >
          {t("run_loading_button")}
        </LoadingButton>
      )}
    </Box>
  );
};

export default RunScenarioButton;
