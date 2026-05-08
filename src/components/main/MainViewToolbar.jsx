import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, IconButton, Tooltip } from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { useMapTools } from "../../utils/mapTools";
import { useReportTools } from "../../utils/reportTools";
import { layoutTransition } from "../../theme/theme";
import SaveScenarioDialog from "../workspace/SaveScenarioDialog";

const MainViewToolbar = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const isScenarioRunCompleted = useResultsStore((s) => s.isScenarioRunCompleted);
  const mapTitle = useUIStore((s) => s.mapTitle);
  const scenarioRunCode = useWorkspaceStore((s) => s.scenarioRunCode);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const { handleCaptureSnapshot } = useMapTools();
  const { fetchReports } = useReportTools();
  const reloadWorkspaceScenarios = useWorkspaceStore((s) => s.loadScenarios);
  const { t } = useTranslation();

  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  if (selectedTab !== 1) return null;

  const captureSupported =
    activeViewControl === "display_map" ||
    (activeViewControl === "display_chart" && (selectedSubTab === 0 || selectedSubTab === 1));
  const captureDisabled =
    snapshotBusy || !scenarioRunCode || !isScenarioRunCompleted || !captureSupported;
  const saveScenarioDisabled = !isScenarioRunCompleted || !scenarioRunCode;

  const onCapture = async () => {
    setSnapshotBusy(true);
    try {
      await handleCaptureSnapshot();
    } finally {
      setSnapshotBusy(false);
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Tooltip title={t("workspace_snapshot_capture_tooltip")}>
        <span>
          <IconButton
            size="small"
            aria-label={t("workspace_snapshot_capture_aria")}
            disabled={captureDisabled}
            onClick={onCapture}
            sx={{ color: "text.primary" }}
          >
            <PhotoCameraIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Button
        size="small"
        variant="contained"
        disabled={saveScenarioDisabled}
        onClick={() => setSaveDialogOpen(true)}
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
      <SaveScenarioDialog
        open={saveDialogOpen}
        scenarioId={scenarioRunCode}
        defaultName={mapTitle}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={() => {
          fetchReports();
          reloadWorkspaceScenarios({ force: true });
        }}
      />
    </Box>
  );
};

export default MainViewToolbar;
