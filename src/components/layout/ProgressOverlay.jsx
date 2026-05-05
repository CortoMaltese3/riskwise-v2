import React, { useEffect } from "react";
import { Backdrop, Box, Button, LinearProgress, Paper, Typography } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { enqueueToast } from "../../hooks/useToast";
import useStore from "../../store";

// Full-content-area overlay rendered during scenario execution. Step label is
// fed from the main store's ``modalMessage`` (populated by the progress
// IPC/SSE events). Cancel posts to the backend cancel endpoint and tears
// down the overlay locally so the user regains control even if the request
// is still in flight.
const ProgressOverlay = () => {
  const isScenarioRunning = useStore((state) => state.isScenarioRunning);
  const modalMessage = useStore((state) => state.modalMessage);
  const progress = useStore((state) => state.progress);
  const scenarioRunCode = useStore((state) => state.scenarioRunCode);
  const setIsScenarioRunning = useStore((state) => state.setIsScenarioRunning);
  const setModalMessage = useStore((state) => state.setModalMessage);

  useEffect(() => {
    if (!window.electron?.onProgress) return undefined;
    const unsubscribe = window.electron.onProgress((data) => {
      if (data?.message) setModalMessage(data.message);
    });
    return unsubscribe;
  }, [setModalMessage]);

  const handleCancel = async () => {
    setIsScenarioRunning(false);
    setModalMessage("");
    if (!scenarioRunCode) return;
    try {
      const response = await RiskWiseClient.cancelScenario(scenarioRunCode);
      if (response?.success === false && response.error) {
        enqueueToast({
          severity: "warning",
          message: response.error.message || "Could not cancel scenario",
          code: response.error.code,
        });
      } else {
        enqueueToast({ severity: "info", message: "Scenario cancelled" });
      }
    } catch (err) {
      enqueueToast({
        severity: "warning",
        message: err?.message || "Could not cancel scenario",
      });
    }
  };

  const hasNumericProgress = typeof progress === "number" && progress > 0 && progress <= 100;
  const progressValue = hasNumericProgress ? progress : undefined;

  return (
    <Backdrop
      open={isScenarioRunning}
      role="progressbar"
      aria-label="scenario_progress_overlay"
      sx={(theme) => ({
        color: theme.palette.common.white,
        zIndex: theme.zIndex.modal + 1,
        backdropFilter: `blur(${theme.spacing(0.25)})`,
      })}
    >
      <Paper
        elevation={6}
        sx={{
          p: 4,
          minWidth: 360,
          maxWidth: 520,
          width: "80%",
          borderRadius: 3,
        }}
      >
        <Typography variant="h6" gutterBottom>
          Running scenario
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, minHeight: 24 }}
          aria-live="polite"
          data-testid="progress-step-label"
        >
          {modalMessage || "Starting…"}
        </Typography>
        <LinearProgress
          variant={hasNumericProgress ? "determinate" : "indeterminate"}
          value={progressValue}
          sx={{ height: 8, borderRadius: 4, mb: 3 }}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            onClick={handleCancel}
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            aria-label="scenario_progress_cancel"
          >
            Cancel
          </Button>
        </Box>
      </Paper>
    </Backdrop>
  );
};

export default ProgressOverlay;
