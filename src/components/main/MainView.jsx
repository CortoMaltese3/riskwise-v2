import React from "react";

import { Box } from "@mui/material";

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
import useUIStore from "../../store/useUIStore";
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

const MainView = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedTab = useUIStore((s) => s.selectedTab);

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
          <Box sx={STRETCH_SX}>
            {activeViewControl === "display_map" && <MapLayout />}
            {activeViewControl === "display_chart" && <RiskChartLayout />}
          </Box>
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
