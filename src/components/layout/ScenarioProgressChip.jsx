import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  CircularProgress,
  Fade,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { enqueueToast } from "../../hooks/useToast";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { SCENARIO_PHASES, TERMINAL_PHASES } from "../../store/scenarioPhases";

const TERMINAL_FADE_MS = 10_000;
const CANCEL_CONFIRM_MS = 3_000;

// Per-phase presentation config so the chip body has one branch per phase
// instead of separate `=== "running"` / `=== "completed"` chains for the
// title, action row, and progress bar.
const PHASE_CONFIG = {
  [SCENARIO_PHASES.RUNNING]: {
    titleKey: "scenario_chip_running_title",
    showProgressBar: true,
    action: "cancel",
  },
  [SCENARIO_PHASES.CANCELLING]: {
    titleKey: "scenario_chip_cancelling_title",
    showProgressBar: true,
    action: "spinner",
  },
  [SCENARIO_PHASES.COMPLETED]: {
    titleKey: "scenario_chip_completed_title",
    showProgressBar: false,
    action: "view-results",
  },
  [SCENARIO_PHASES.FAILED]: {
    titleKey: "scenario_chip_failed_title",
    showProgressBar: false,
    action: null,
  },
};

const ScenarioProgressChip = () => {
  const { t } = useTranslation();
  const scenarioPhase = useResultsStore((s) => s.scenarioPhase);
  const activeRunSummary = useResultsStore((s) => s.activeRunSummary);
  const setScenarioPhase = useResultsStore((s) => s.setScenarioPhase);
  const resetScenarioPhase = useResultsStore((s) => s.resetScenarioPhase);
  const setIsScenarioRunning = useResultsStore((s) => s.setIsScenarioRunning);
  const modalMessage = useUIStore((s) => s.modalMessage);
  const progress = useUIStore((s) => s.progress);
  const setModalMessage = useUIStore((s) => s.setModalMessage);
  const setProgress = useUIStore((s) => s.setProgress);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
  const scenarioRunCode = useWorkspaceStore((s) => s.scenarioRunCode);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelConfirmTimerRef = useRef(null);

  // The chip owns the IPC progress subscription that the deleted overlay
  // and loader pair used to share between them — both ``modalMessage`` and
  // ``progress`` are populated from the same ``onProgress`` event.
  useEffect(() => {
    if (!window.electron?.onProgress) return undefined;
    const unsubscribe = window.electron.onProgress((data) => {
      if (data?.message != null) setModalMessage(data.message);
      if (typeof data?.progress === "number") setProgress(data.progress);
    });
    return unsubscribe;
  }, [setModalMessage, setProgress]);

  // Keyed on ``scenarioPhase`` so a new run during the fade window clears
  // the pending reset before it fires.
  useEffect(() => {
    if (!TERMINAL_PHASES.has(scenarioPhase)) return undefined;
    const id = setTimeout(() => {
      resetScenarioPhase();
    }, TERMINAL_FADE_MS);
    return () => clearTimeout(id);
  }, [scenarioPhase, resetScenarioPhase]);

  // Once the backend acknowledges the cancel (phase becomes ``cancelling``
  // or terminal), the two-stage button disappears and any pending revert
  // timer would leak.
  useEffect(() => {
    if (scenarioPhase !== SCENARIO_PHASES.RUNNING && cancelConfirmTimerRef.current) {
      clearTimeout(cancelConfirmTimerRef.current);
      cancelConfirmTimerRef.current = null;
      setConfirmingCancel(false);
    }
  }, [scenarioPhase]);

  useEffect(
    () => () => {
      if (cancelConfirmTimerRef.current) clearTimeout(cancelConfirmTimerRef.current);
    },
    []
  );

  const handleCancelClick = async () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      cancelConfirmTimerRef.current = setTimeout(() => {
        setConfirmingCancel(false);
        cancelConfirmTimerRef.current = null;
      }, CANCEL_CONFIRM_MS);
      return;
    }
    if (cancelConfirmTimerRef.current) {
      clearTimeout(cancelConfirmTimerRef.current);
      cancelConfirmTimerRef.current = null;
    }
    setConfirmingCancel(false);
    setScenarioPhase(SCENARIO_PHASES.CANCELLING);
    if (!scenarioRunCode) {
      // No run code → nothing to cancel server-side; treat as if the
      // backend acknowledged so the chip doesn't get stuck spinning.
      setIsScenarioRunning(false);
      setScenarioPhase(SCENARIO_PHASES.COMPLETED);
      return;
    }
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
    } finally {
      // Cancel is a non-error terminal — flip out of the indeterminate
      // ``cancelling`` state regardless of backend reply, otherwise the
      // chip is stuck on the spinner if the cancel request errored.
      setIsScenarioRunning(false);
      setScenarioPhase(SCENARIO_PHASES.COMPLETED);
    }
  };

  const handleClose = () => {
    if (cancelConfirmTimerRef.current) {
      clearTimeout(cancelConfirmTimerRef.current);
      cancelConfirmTimerRef.current = null;
    }
    setConfirmingCancel(false);
    resetScenarioPhase();
  };

  const handleViewResults = () => {
    if (activeRunSummary?.landingTab) {
      setSelectedTab(activeRunSummary.landingTab);
    }
    handleClose();
  };

  const config = PHASE_CONFIG[scenarioPhase];
  const isTerminal = TERMINAL_PHASES.has(scenarioPhase);
  const summaryLine = activeRunSummary
    ? t("scenario_chip_summary", {
        country: activeRunSummary.country || "",
        hazard: activeRunSummary.hazard || "",
        from: activeRunSummary.timeHorizonStart ?? "",
        to: activeRunSummary.timeHorizonEnd ?? "",
      })
    : "";
  const titleKey = config?.titleKey ?? "scenario_chip_running_title";
  const showProgressBar = config?.showProgressBar ?? false;
  const hasNumericProgress =
    scenarioPhase === SCENARIO_PHASES.RUNNING &&
    typeof progress === "number" &&
    progress > 0 &&
    progress <= 100;

  return (
    <Fade in={scenarioPhase !== null} timeout={300} unmountOnExit>
      <Paper
        role="status"
        aria-label={t(titleKey)}
        elevation={6}
        sx={(theme) => ({
          position: "fixed",
          left: theme.spacing(2),
          bottom: theme.spacing(2),
          width: 360,
          maxWidth: `calc(100vw - ${theme.spacing(4)})`,
          p: 2,
          borderRadius: 3,
          zIndex: theme.zIndex.snackbar,
        })}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t(titleKey)}
          </Typography>
          {isTerminal && (
            <IconButton
              size="small"
              onClick={handleClose}
              aria-label={t("scenario_chip_close_aria")}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
        {summaryLine && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {summaryLine}
          </Typography>
        )}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ minHeight: 20, mb: showProgressBar ? 1 : 0 }}
          aria-live="polite"
          data-testid="progress-step-label"
        >
          {modalMessage || (scenarioPhase === SCENARIO_PHASES.RUNNING ? "Starting…" : "")}
        </Typography>
        {showProgressBar && (
          <LinearProgress
            variant={hasNumericProgress ? "determinate" : "indeterminate"}
            value={hasNumericProgress ? progress : undefined}
            sx={{ height: 6, borderRadius: 4 }}
          />
        )}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5, minHeight: 32 }}>
          {config?.action === "cancel" && (
            <Button
              size="small"
              variant={confirmingCancel ? "contained" : "outlined"}
              color="error"
              onClick={handleCancelClick}
              data-testid="scenario-chip-cancel"
            >
              {t(confirmingCancel ? "scenario_chip_cancel_confirm" : "scenario_chip_cancel")}
            </Button>
          )}
          {config?.action === "spinner" && (
            <CircularProgress
              size={18}
              aria-label={t("scenario_chip_cancelling_title")}
              data-testid="scenario-chip-cancelling"
            />
          )}
          {config?.action === "view-results" && (
            <Button
              size="small"
              variant="text"
              onClick={handleViewResults}
              data-testid="scenario-chip-view-results"
            >
              {t("scenario_chip_view_results")}
            </Button>
          )}
        </Box>
      </Paper>
    </Fade>
  );
};

export default ScenarioProgressChip;
