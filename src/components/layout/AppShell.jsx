import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, Stack, Typography } from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";

import useStore from "../../store";
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "./Sidebar";
import TopBar from "./TopBar";
import AdaptationMeasuresInput from "../input/AdaptationMeasuresInput";
import DataInput from "../input/DataInput";
import MacroEconomicInput from "../inputMacro/MacroEconomicInput";
import MainView from "../main/MainView";
import ResultsView from "../results/ResultsView";
import WorkspaceView from "../workspace/WorkspaceView";
import HomeView from "./views/HomeView";
import SettingsView from "../settings/SettingsView";
import UpdateDialog from "../UpdateDialog";
import EngineStatusBanner from "../EngineStatusBanner";
import OfflineIndicator from "./OfflineIndicator";
import AppViewport from "./primitives/AppViewport";
import HorizontalSplit from "./primitives/HorizontalSplit";
import FixedColumn from "./primitives/FixedColumn";
import ScrollableRegion from "./primitives/ScrollableRegion";

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

export const RiskAssessmentView = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
      <LeftPanel>
        <DataInput />
        <AdaptationMeasuresInput />
      </LeftPanel>
      <Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
        <MainView />
      </Box>
      <Box
        component="aside"
        role="complementary"
        aria-label={t("results_panel_aria")}
        data-tour="results-panel"
        sx={{ width: 260, overflow: "auto", borderLeft: 1, borderColor: "divider", p: 1 }}
      >
        <ResultsView />
      </Box>
    </Box>
  );
};

const MacroEmptyState = () => {
  const { t } = useTranslation();
  const setSelectedMacroCard = useStore((s) => s.setSelectedMacroCard);
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={{ height: "100%", color: "text.secondary", textAlign: "center", px: 4 }}
    >
      <InsightsIcon sx={{ fontSize: 64 }} />
      <Typography variant="h6">{t("macro_empty_title")}</Typography>
      <Typography variant="body2" sx={{ maxWidth: 420 }}>
        {t("macro_empty_body")}
      </Typography>
      <Button variant="contained" onClick={() => setSelectedMacroCard("country")}>
        {t("macro_empty_cta")}
      </Button>
    </Stack>
  );
};

const MacroeconomicView = () => {
  const credOutputData = useStore((s) => s.credOutputData);
  const showEmpty = !credOutputData || credOutputData.length === 0;
  return (
    <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
      <LeftPanel>
        <MacroEconomicInput />
      </LeftPanel>
      <Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
        {showEmpty ? <MacroEmptyState /> : <MainView />}
      </Box>
    </Box>
  );
};

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
  const { t } = useTranslation();
  const { activeSection, setSelectedTab, sidebarCollapsed } = useStore();

  useEffect(() => {
    const tab = sectionToTab[activeSection];
    if (typeof tab === "number") setSelectedTab(tab);
  }, [activeSection, setSelectedTab]);

  const Section = sectionComponents[activeSection] || HomeView;
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <AppViewport>
      <TopBar />
      <HorizontalSplit>
        <FixedColumn width={sidebarWidth}>
          <Sidebar />
        </FixedColumn>
        <ScrollableRegion>
          <Box
            component="main"
            role="main"
            id="main-content"
            aria-label={t("main_content_aria")}
            sx={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            <EngineStatusBanner />
            <Section />
          </Box>
        </ScrollableRegion>
      </HorizontalSplit>
      <UpdateDialog />
      <OfflineIndicator />
    </AppViewport>
  );
};

export default AppShell;
