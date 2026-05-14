import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, CircularProgress, IconButton, Tooltip } from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { enqueueToast } from "../../hooks/useToast";
import { useMapTools } from "../../utils/mapTools";
import { useReportTools } from "../../utils/reportTools";
import { layoutTransition } from "../../theme/theme";
import SaveScenarioDialog from "../workspace/SaveScenarioDialog";
import { TABS } from "./tabs";

// Surfaces where capturing adds no value: the chart panes (waterfall and
// cost-benefit) render byte-equivalent figures into the PDF report
// automatically, so a manual snapshot would just duplicate the auto-render
// at smaller resolution. Deny-list, not allow-list: any new surface
// defaults to enabled until it is explicitly listed here.
const UNSUPPORTED_CAPTURE_SURFACES = new Set(["display_chart"]);

const MainViewToolbar = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const isScenarioRunCompleted = useResultsStore((s) => s.isScenarioRunCompleted);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const mapTitle = useUIStore((s) => s.mapTitle);
  const scenarioRunCode = useWorkspaceStore((s) => s.scenarioRunCode);
  const scenarioRunSaved = useWorkspaceStore((s) => s.scenarioRunSaved);
  const setScenarioRunSaved = useWorkspaceStore((s) => s.setScenarioRunSaved);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const { handleCaptureSnapshot } = useMapTools();
  const { fetchReports } = useReportTools();
  const reloadWorkspaceScenarios = useWorkspaceStore((s) => s.loadScenarios);
  const { t } = useTranslation();

  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  if (selectedTab !== TABS.RISK && selectedTab !== TABS.ADAPTATION) return null;

  const noScenarioRun = !scenarioRunCode || !isScenarioRunCompleted;
  const surfaceUnsupported = UNSUPPORTED_CAPTURE_SURFACES.has(activeViewControl);
  const captureDisabled = snapshotBusy || noScenarioRun || surfaceUnsupported || isScenarioRunning;
  const saveScenarioDisabled = !isScenarioRunCompleted || !scenarioRunCode || isScenarioRunning;

  let captureTooltipKey = "workspace_snapshot_capture_tooltip";
  if (snapshotBusy) {
    captureTooltipKey = "workspace_snapshot_capturing_tooltip";
  } else if (isScenarioRunning) {
    captureTooltipKey = "scenario_running_disabled_tooltip";
  } else if (noScenarioRun) {
    captureTooltipKey = "workspace_snapshot_disabled_no_run_tooltip";
  } else if (surfaceUnsupported) {
    captureTooltipKey = "workspace_snapshot_disabled_chart_tooltip";
  }

  const saveTooltipKey = isScenarioRunning ? "scenario_running_disabled_tooltip" : "";

  const onCapture = async () => {
    setSnapshotBusy(true);
    try {
      await handleCaptureSnapshot();
    } finally {
      setSnapshotBusy(false);
    }
  };

  const onSaveClick = () => {
    if (scenarioRunSaved) {
      enqueueToast({
        severity: "info",
        message: t("save_scenario_already_saved_toast"),
      });
      return;
    }
    setSaveDialogOpen(true);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Tooltip title={t(captureTooltipKey)}>
        <span>
          <IconButton
            size="small"
            aria-label={t("workspace_snapshot_capture_aria")}
            disabled={captureDisabled}
            onClick={onCapture}
            sx={{ color: "text.primary" }}
          >
            {snapshotBusy ? (
              <CircularProgress size={20} thickness={5} aria-hidden sx={{ color: "inherit" }} />
            ) : (
              <PhotoCameraIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={saveTooltipKey ? t(saveTooltipKey) : ""}>
        <span>
          <Button
            size="small"
            variant="contained"
            disabled={saveScenarioDisabled}
            onClick={onSaveClick}
            aria-label={t("save_scenario_button_aria")}
            sx={{
              bgcolor: "secondary.light",
              color: "text.primary",
              transition: layoutTransition(["transform"]),
              "&:active": { transform: "scale(0.96)" },
              "&:hover": { bgcolor: "secondary.main" },
              textTransform: "none",
            }}
          >
            {t("save_scenario_button_label")}
          </Button>
        </span>
      </Tooltip>
      <SaveScenarioDialog
        open={saveDialogOpen}
        scenarioId={scenarioRunCode}
        defaultName={mapTitle}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={() => {
          fetchReports();
          reloadWorkspaceScenarios({ force: true });
          setScenarioRunSaved(true);
        }}
      />
    </Box>
  );
};

export default MainViewToolbar;
