import React, { useEffect } from "react";
import { Box } from "@mui/material";

import useStore from "../../store";
import Sidebar, { TOP_BAR_HEIGHT } from "./Sidebar";
import TopBar from "./TopBar";
import AdaptationMeasuresInput from "../input/AdaptationMeasuresInput";
import DataInput from "../input/DataInput";
import MacroEconomicInput from "../inputMacro/MacroEconomicInput";
import MainView from "../main/MainView";
import ResultsView from "../results/ResultsView";
import WorkspaceView from "../workspace/WorkspaceView";
import HomeView from "./views/HomeView";
import SettingsView from "./views/SettingsView";

const sectionToTab = { home: 0, risk: 1, macro: 2, workspace: 3, settings: 0 };

const LeftPanel = ({ children }) => (
  <Box
    sx={{
      width: 280,
      minWidth: 220,
      maxWidth: 520,
      resize: "horizontal",
      overflow: "auto",
      borderRight: 1,
      borderColor: "divider",
      p: 1,
    }}
  >
    {children}
  </Box>
);

const RiskAssessmentView = () => (
  <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
    <LeftPanel>
      <DataInput />
      <AdaptationMeasuresInput />
    </LeftPanel>
    <Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
      <MainView />
    </Box>
    <Box sx={{ width: 260, overflow: "auto", borderLeft: 1, borderColor: "divider", p: 1 }}>
      <ResultsView />
    </Box>
  </Box>
);

const MacroeconomicView = () => (
  <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
    <LeftPanel>
      <MacroEconomicInput />
    </LeftPanel>
    <Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
      <MainView />
    </Box>
  </Box>
);

const WorkspaceSection = () => (
  <Box sx={{ flexGrow: 1, overflow: "auto" }}>
    <WorkspaceView />
  </Box>
);

const sectionComponents = {
  home: HomeView,
  risk: RiskAssessmentView,
  macro: MacroeconomicView,
  workspace: WorkspaceSection,
  settings: SettingsView,
};

const AppShell = () => {
  const { activeSection, setSelectedTab } = useStore();

  useEffect(() => {
    const tab = sectionToTab[activeSection];
    if (typeof tab === "number") setSelectedTab(tab);
  }, [activeSection, setSelectedTab]);

  const Section = sectionComponents[activeSection] || HomeView;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <TopBar />
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          mt: `${TOP_BAR_HEIGHT}px`,
          minHeight: 0,
        }}
      >
        <Section />
      </Box>
    </Box>
  );
};

export default AppShell;
