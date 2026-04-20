import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";

import RiskWiseClient from "../../lib/RiskWiseClient";
import SaveScenarioDialog from "../workspace/SaveScenarioDialog";
import { useReportTools } from "../../utils/reportTools";
import useStore from "../../store";

const RunScenarioButton = () => {
  const { t } = useTranslation();
  const {
    isValidExposureEconomic,
    isValidExposureNonEconomic,
    isValidHazard,
    setMapTitle,
    setIsScenarioRunning,
    selectedCountry,
    selectedAnnualGrowth,
    selectedAppOption,
    selectedExposureEconomic,
    selectedExposureFile,
    selectedExposureNonEconomic,
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
  } = useStore();

  const [isRunButtonLoading, setIsRunButtonLoading] = useState(false);
  const [isRunButtonDisabled, setIsRunButtonDisabled] = useState(true);
  const [saveDialog, setSaveDialog] = useState({ open: false, id: null, name: "" });
  const { fetchReports } = useReportTools();

  const handleRunButton = () => {
    if (
      selectedCountry &&
      selectedHazard &&
      selectedScenario &&
      (selectedExposureEconomic || selectedExposureNonEconomic) &&
      isValidHazard &&
      (isValidExposureEconomic || isValidExposureNonEconomic)
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
    selectedExposureEconomic,
    selectedExposureFile,
    selectedExposureNonEconomic,
    selectedHazard,
    selectedHazardFile,
    selectedScenario,
    selectedTimeHorizon,
  ]);

  const onRunHandler = () => {
    const body = {
      annualGrowth: selectedAnnualGrowth,
      countryName: selectedCountry,
      exposureEconomic: selectedExposureEconomic,
      exposureFile: selectedExposureFile,
      exposureNonEconomic: selectedExposureNonEconomic,
      hazardType: selectedHazard,
      isEra: selectedAppOption === "era" ? true : false,
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
    <Box sx={{ textAlign: "center", mt: 2 }}>
      <SaveScenarioDialog
        open={saveDialog.open}
        scenarioId={saveDialog.id}
        defaultName={saveDialog.name}
        onClose={() => setSaveDialog((s) => ({ ...s, open: false }))}
        onSaved={() => fetchReports()}
      />
      {!isRunButtonLoading ? (
        <Button
          key="runButton"
          disabled={isRunButtonDisabled}
          onClick={onRunHandler}
          size="medium"
          startIcon={<PlayCircleIcon />}
          sx={{
            minWidth: "120px",
            bgcolor: "accent.main",
            "&:hover": { bgcolor: "accent.light" },
          }}
          variant="contained"
        >
          {t("run_button")}
        </Button>
      ) : (
        <LoadingButton
          loading={isRunButtonLoading}
          loadingPosition="center"
          sx={{ minWidth: "120px" }}
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
