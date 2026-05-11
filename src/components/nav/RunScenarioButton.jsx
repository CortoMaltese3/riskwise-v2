import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";

import SaveScenarioDialog from "../workspace/SaveScenarioDialog";
import { useReportTools } from "../../utils/reportTools";
import useRunScenario from "../../hooks/useRunScenario";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const RunScenarioButton = () => {
  const { t } = useTranslation();
  const isValidExposure = useWorkspaceStore((s) => s.isValidExposure);
  const isValidHazard = useWorkspaceStore((s) => s.isValidHazard);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedHazardFile = useWorkspaceStore((s) => s.selectedHazardFile);
  const selectedScenario = useWorkspaceStore((s) => s.selectedScenario);
  const selectedTimeHorizon = useWorkspaceStore((s) => s.selectedTimeHorizon);

  const [isRunButtonLoading, setIsRunButtonLoading] = useState(false);
  const [isRunButtonDisabled, setIsRunButtonDisabled] = useState(true);
  const [saveDialog, setSaveDialog] = useState({ open: false, id: null, name: "" });
  const { fetchReports } = useReportTools();
  const reloadWorkspaceScenarios = useWorkspaceStore((s) => s.loadScenarios);
  const { runScenario } = useRunScenario();

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
    setIsRunButtonDisabled(true);
    setIsRunButtonLoading(true);
    runScenario({
      onSuccess: (response) => {
        if (response.result.data.scenarioId) {
          setSaveDialog({
            open: true,
            id: response.result.data.scenarioId,
            name: response.result.data.mapTitle || "",
          });
        }
      },
    }).finally(() => {
      setIsRunButtonLoading(false);
      setIsRunButtonDisabled(false);
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
