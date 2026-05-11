import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Stack, Typography } from "@mui/material";

import AdaptationMap from "../map/AdaptationMap";
import AdaptationChartLayout from "../controls/AdaptationChartLayout";
import RiskChartLayout from "../controls/RiskChartLayout";
import MacroEconomicChart from "../charts/MacroEconomicChart";
import MainViewControls from "../controls/MainViewControls";
import MainViewToolbar from "./MainViewToolbar";
import MacroViewControls from "../controls/MacroViewControls";
import MainViewTitle from "../title/MainViewTitle";
import MapLayout from "../map/MapLayout";
import ViewCard from "../cards/ViewCard";
import ReportsView from "../reports/ReportsView";
import ViewMacroCard from "../cards/ViewMacroCard";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { useMacroTools } from "../../utils/macroTools";
import { TABS, RISK_SUB_TABS } from "./tabs";

const COLUMN_SX = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

// Cards in the project use `margin: "auto"` for horizontal centering. Inside a
// flex-column parent, that auto margin also consumes vertical space and pushes
// the card to the middle. STRETCH_SX is for visual surfaces (map, chart) that
// genuinely need to fill the pane; TOP_SX is for parameter cards so they stay
// pinned to the top while controls remain at the bottom of MainView.
const STRETCH_SX = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" };
const TOP_SX = { flex: 1, minHeight: 0, overflowY: "auto" };
const CONTROLS_ROW_SX = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 2,
};

const AdaptationEmptyState = () => {
  const { t } = useTranslation();
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  return (
    <Box
      data-testid="adaptation-empty-state-no-run"
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        p: 3,
      }}
    >
      <Stack spacing={2} alignItems="center">
        <Typography variant="body1">{t("adaptation_empty_state_no_run")}</Typography>
        <Button
          variant="contained"
          onClick={() => setActiveSection("risk")}
          sx={{ textTransform: "none" }}
        >
          {t("adaptation_empty_state_go_to_risk")}
        </Button>
      </Stack>
    </Box>
  );
};

const MainView = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const selectedReport = useUIStore((s) => s.selectedReport);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const credOutputData = useResultsStore((s) => s.credOutputData);
  const isScenarioRunCompleted = useResultsStore((s) => s.isScenarioRunCompleted);
  const { loadCREDOutputData } = useMacroTools();

  // Lazy-load CRED output data when the Macro tab becomes active inside
  // MainView (Risk section path). The sidebar-driven Macro section already
  // does this in AppShell.MacroeconomicView; both surfaces need to fetch
  // because they mount under different parents. The ref guards against
  // duplicate in-flight fetches on rapid tab toggling. See #248.
  const credFetchInFlight = useRef(false);
  useEffect(() => {
    if (selectedTab !== TABS.MACRO) return;
    if (credOutputData && credOutputData.length > 0) return;
    if (credFetchInFlight.current) return;
    credFetchInFlight.current = true;
    Promise.resolve(loadCREDOutputData()).finally(() => {
      credFetchInFlight.current = false;
    });
  }, [selectedTab, credOutputData, loadCREDOutputData]);

  return (
    <Box sx={COLUMN_SX}>
      <MainViewTitle />
      {selectedTab === TABS.PARAMETERS && (
        <Box sx={TOP_SX}>
          <ViewCard />
        </Box>
      )}
      {selectedTab === TABS.RISK && selectedSubTab === RISK_SUB_TABS.RISK && (
        <>
          {activeViewControl === "display_parameters" ? (
            <Box sx={TOP_SX}>
              <ViewCard />
            </Box>
          ) : (
            <Box sx={STRETCH_SX}>
              {activeViewControl === "display_map" && <MapLayout />}
              {activeViewControl === "display_chart" && <RiskChartLayout />}
            </Box>
          )}
          <Box sx={CONTROLS_ROW_SX}>
            <MainViewControls />
            <MainViewToolbar />
          </Box>
        </>
      )}
      {selectedTab === TABS.RISK && selectedSubTab === RISK_SUB_TABS.ADAPTATION && (
        <>
          <Box sx={STRETCH_SX}>
            {activeViewControl === "display_map" && <AdaptationMap />}
            {activeViewControl === "display_chart" && <AdaptationChartLayout />}
          </Box>
          <Box sx={CONTROLS_ROW_SX}>
            <MainViewControls />
            <MainViewToolbar />
          </Box>
        </>
      )}
      {selectedTab === TABS.ADAPTATION && (
        <>
          <Box sx={STRETCH_SX}>
            {!isScenarioRunCompleted && !selectedReport ? (
              <AdaptationEmptyState />
            ) : (
              <>
                {activeViewControl === "display_map" && <AdaptationMap />}
                {activeViewControl === "display_chart" && <AdaptationChartLayout />}
              </>
            )}
          </Box>
          <Box sx={CONTROLS_ROW_SX}>
            <MainViewControls />
            <MainViewToolbar />
          </Box>
        </>
      )}
      {selectedTab === TABS.MACRO && (
        <>
          {activeViewControl === "display_macro_parameters" && (
            <Box sx={TOP_SX}>
              <ViewMacroCard />
            </Box>
          )}
          {activeViewControl === "display_macro_chart" && (
            <Box sx={STRETCH_SX}>
              <MacroEconomicChart />
            </Box>
          )}
          <MacroViewControls />
        </>
      )}
      {selectedTab === TABS.REPORTS && (
        <Box sx={STRETCH_SX}>
          <ReportsView />
        </Box>
      )}
    </Box>
  );
};

export default MainView;
