import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Tooltip } from "@mui/material";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { useMapTools } from "../../utils/mapTools";
import { layoutTransition } from "../../theme/theme";
import { TABS } from "./tabs";

// Sibling toolbar to the sub-tab `<Tabs>` strip. The Save Scenario and
// Save Map | Save Chart buttons used to live inside `<Tabs>` (#249);
// hoisting them here lets MUI announce them as buttons rather than tabs
// and drops the absolute-positioning hack that previously right-aligned
// them.
const BUTTON_SX = {
  bgcolor: "secondary.light",
  transition: layoutTransition(["transform"]),
  "&:active": { transform: "scale(0.96)" },
  "&:hover": { bgcolor: "secondary.main" },
  textTransform: "none",
};

const SubTabActions = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const { handleSaveImage, handleSaveMap, handleAddToOutput } = useMapTools();
  const { t } = useTranslation();

  if (selectedTab !== TABS.RISK && selectedTab !== TABS.ADAPTATION) return null;

  const onSaveMapOrChart = () => {
    if (activeViewControl === "display_map") return handleSaveMap();
    if (activeViewControl === "display_chart") return handleSaveImage();
    // No-op for other view controls (no map or chart to save).
  };

  const saveMapOrChartLabel =
    activeViewControl === "display_map"
      ? t("main_subsection_title_save_map")
      : t("main_subsection_title_save_chart");

  const tooltip = isScenarioRunning ? t("scenario_running_disabled_tooltip") : "";

  return (
    <Box
      role="toolbar"
      aria-label={t("main_subsection_actions_aria")}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 1,
        pr: 1,
      }}
    >
      <Tooltip title={tooltip}>
        <span>
          <Button
            variant="contained"
            size="small"
            sx={BUTTON_SX}
            disabled={isScenarioRunning}
            onClick={handleAddToOutput}
          >
            {t("main_subsection_title_save_scenario")}
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={tooltip}>
        <span>
          <Button
            variant="contained"
            size="small"
            sx={BUTTON_SX}
            disabled={isScenarioRunning}
            onClick={onSaveMapOrChart}
          >
            {saveMapOrChartLabel}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
};

export default SubTabActions;
