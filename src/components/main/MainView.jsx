import React from "react";

import { Box } from "@mui/material";

import AdaptationMap from "../map/AdaptationMap";
import AdaptationChartLayout from "../controls/AdaptationChartLayout";
import RiskChartLayout from "../controls/RiskChartLayout";
import MacroEconomicChart from "../charts/MacroEconomicChart";
import MainViewControls from "../controls/MainViewControls";
import MacroViewControls from "../controls/MacroViewControls";
import MainViewTitle from "../title/MainViewTitle";
import MapLayout from "../map/MapLayout";
import ViewCard from "../cards/ViewCard";
import ReportsView from "../reports/ReportsView";
import ViewMacroCard from "../cards/ViewMacroCard";
import useStore from "../../store";

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

const MainView = () => {
  const { activeViewControl, selectedSubTab, selectedTab } = useStore();

  return (
    <Box sx={COLUMN_SX}>
      <MainViewTitle />
      {selectedTab === 0 && (
        <Box sx={TOP_SX}>
          <ViewCard />
        </Box>
      )}
      {selectedTab === 1 && selectedSubTab === 0 && (
        <>
          <Box sx={STRETCH_SX}>
            {activeViewControl === "display_map" && <MapLayout />}
            {activeViewControl === "display_chart" && <RiskChartLayout />}
          </Box>
          <MainViewControls />
        </>
      )}
      {selectedTab === 1 && selectedSubTab === 1 && (
        <>
          <Box sx={STRETCH_SX}>
            {activeViewControl === "display_map" && <AdaptationMap />}
            {activeViewControl === "display_chart" && <AdaptationChartLayout />}
          </Box>
          <MainViewControls />
        </>
      )}
      {selectedTab === 2 && (
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
      {selectedTab === 3 && (
        <Box sx={STRETCH_SX}>
          <ReportsView />
        </Box>
      )}
    </Box>
  );
};

export default MainView;
