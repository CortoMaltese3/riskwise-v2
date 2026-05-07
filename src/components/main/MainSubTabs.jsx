import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, IconButton, Tabs, Tab, Paper, Tooltip } from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

import useStore from "../../store";
import useWorkspaceStore from "../../store/workspaceSlice";
import { useMapTools } from "../../utils/mapTools";
import { useReportTools } from "../../utils/reportTools";
import { layoutTransition } from "../../theme/theme";
import SaveScenarioDialog from "../workspace/SaveScenarioDialog";

const MainSubTabs = () => {
  const {
    activeViewControl,
    isScenarioRunCompleted,
    mapTitle,
    scenarioRunCode,
    selectedSubTab,
    selectedTab,
    setSelectedSubTab,
    setActiveViewControl,
  } = useStore();
  const { handleSaveImage, handleSaveMap, handleAddToOutput, handleCaptureSnapshot } =
    useMapTools();
  const { fetchReports } = useReportTools();
  const reloadWorkspaceScenarios = useWorkspaceStore((s) => s.loadScenarios);
  const { t } = useTranslation();
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const saveScenarioDisabled = !isScenarioRunCompleted || !scenarioRunCode;

  const captureDisabled =
    snapshotBusy ||
    !scenarioRunCode ||
    !isScenarioRunCompleted ||
    !(
      activeViewControl === "display_map" ||
      (activeViewControl === "display_chart" && (selectedSubTab === 0 || selectedSubTab === 1))
    );

  const onCapture = async () => {
    setSnapshotBusy(true);
    try {
      await handleCaptureSnapshot();
    } finally {
      setSnapshotBusy(false);
    }
  };

  const subTabsMap = {
    0: [], // Subtabs for "Parameters section"
    1: [
      t("main_subsection_title_risk"),
      t("main_subsection_title_adaptation"),
      t("main_subsection_title_save_scenario"),
      activeViewControl === "display_map"
        ? t("main_subsection_title_save_map")
        : t("main_subsection_title_save_chart"), // Dynamically change label
    ],
    2: [], // Subtabs for "Macroeconomic section"
    3: [], // Subtabs for "Outputs (reporting) section"
  };

  const handleSubTabChange = (event, newValue) => {
    setSelectedSubTab(newValue);
    // Set the active vew to display_chart if Economic & Non-Economic tab is selected.
    // The display_map is not currently available for this tab.
    if (newValue === 1) {
      setActiveViewControl("display_chart");
    }
  };

  const handleButtonClick = (index) => {
    if (activeViewControl === "display_map") {
      return index === 2 ? handleAddToOutput() : handleSaveMap();
    } else if (activeViewControl === "display_chart") {
      return handleSaveImage();
    }
    // Do nothing if activeViewControl is not "display_map" or "display_chart"
  };

  const subTabs = subTabsMap[selectedTab];
  if (!subTabs) {
    return null; // This main tab does not have subtabs
  }

  return (
    <Paper
      square
      sx={{
        position: "fixed",
        top: 16,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        width: "100%",
        bgcolor: "primary.light",
      }}
    >
      {selectedTab === 1 && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            right: 200,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            height: "100%",
            px: 1,
            gap: 1,
          }}
        >
          <Tooltip title={t("workspace_snapshot_capture_tooltip")}>
            <span>
              <IconButton
                size="small"
                color="inherit"
                aria-label={t("workspace_snapshot_capture_aria")}
                disabled={captureDisabled}
                onClick={onCapture}
                sx={{ color: "common.white" }}
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
      )}
      <Tabs
        value={selectedSubTab}
        onChange={handleSubTabChange}
        aria-label={`sub navigation tabs for main tab ${selectedTab}`}
        textColor="inherit"
        indicatorColor="secondary"
        variant="fullWidth"
        centered
        sx={{
          minHeight: 24,
          // Selected tab keeps white-on-primary.main; primary.main was darkened
          // in #121 (now 4.94:1 with white). Unselected tab switched from white
          // to text.primary because white-on-primary.light was 1.87:1.
          ".Mui-selected": { bgcolor: "primary.main", color: "common.white" },
          ".MuiTab-root": {
            color: "text.primary",
            fontSize: "0.875rem",
            minHeight: 24,
            py: 0.75,
            px: 1.5,
          },
          ".MuiTabs-indicator": {
            height: 2,
          },
          ".MuiTab-root:not(.Mui-selected)": { bgcolor: "primary.light" },
        }}
      >
        {subTabs.map((label, index) =>
          // Conditionally render a button instead of a tab for "+ Save Scenario" and "Save to Map"
          index === 2 || index === 3 ? (
            <Box
              key={index}
              sx={{ position: "absolute", top: 0, right: index === 2 ? 100 : index === 3 ? 0 : 8 }}
            >
              <Button
                variant="contained"
                size="small"
                sx={{
                  bgcolor: "secondary.light",
                  transition: layoutTransition(["transform"]),
                  "&:active": {
                    transform: "scale(0.96)",
                  },
                  "&:hover": { bgcolor: "secondary.main" },
                  textTransform: "none",
                }}
                onClick={() => handleButtonClick(index)}
              >
                {label}
              </Button>
            </Box>
          ) : (
            <Tab key={index} label={label} sx={{ minHeight: 24 }} /> // Apply the reduced height
          )
        )}
      </Tabs>
    </Paper>
  );
};

export default MainSubTabs;
