import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";

import RiskWiseClient from "../../lib/RiskWiseClient";
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
        setScenarioRunCode();
        setIsScenarioRunCompleted(true);
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
      {!isRunButtonLoading ? (
        <Button
          key="runButton"
          disabled={isRunButtonDisabled}
          onClick={onRunHandler}
          size="medium"
          startIcon={<PlayCircleIcon />}
          sx={{
            minWidth: "120px",
            bgcolor: "#F79191",
            "&:hover": { bgcolor: "#FFCCCC" },
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
