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
import RunPlotMacroButton from "../nav/RunPlotMacroButton";
import RunScenarioButton from "../nav/RunScenarioButton";
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

const RISK_LEFT_PANEL_WIDTH = 280;
const RISK_RESULTS_PANEL_WIDTH = 260;
const MACRO_LEFT_PANEL_WIDTH = 280;

export const RiskAssessmentView = () => {
  const { t } = useTranslation();
  const selectedTab = useStore((s) => s.selectedTab);
  const selectedSubTab = useStore((s) => s.selectedSubTab);
  const showRunButton = selectedTab === 0 || (selectedTab === 1 && selectedSubTab === 0);
  return (
    <HorizontalSplit>
      <FixedColumn width={RISK_LEFT_PANEL_WIDTH}>
        <Box
          sx={{
            height: "100%",
            borderRight: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ScrollableRegion>
            <Box sx={{ p: 1 }}>
              <DataInput />
              <AdaptationMeasuresInput />
            </Box>
          </ScrollableRegion>
          {showRunButton && (
            <Box
              sx={{
                flexShrink: 0,
                p: 1,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <RunScenarioButton />
            </Box>
          )}
        </Box>
      </FixedColumn>
      <ScrollableRegion>
        <Box sx={{ p: 2 }}>
          <MainView />
        </Box>
      </ScrollableRegion>
      <FixedColumn width={RISK_RESULTS_PANEL_WIDTH}>
        <Box
          component="aside"
          role="complementary"
          aria-label={t("results_panel_aria")}
          data-tour="results-panel"
          sx={{
            height: "100%",
            borderLeft: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ScrollableRegion>
            <Box sx={{ p: 1 }}>
              <ResultsView />
            </Box>
          </ScrollableRegion>
        </Box>
      </FixedColumn>
    </HorizontalSplit>
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
    <HorizontalSplit>
      <FixedColumn width={MACRO_LEFT_PANEL_WIDTH}>
        <Box
          sx={{
            height: "100%",
            borderRight: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ScrollableRegion>
            <Box sx={{ p: 1 }}>
              <MacroEconomicInput />
            </Box>
          </ScrollableRegion>
          <Box
            sx={{
              flexShrink: 0,
              p: 1,
              borderTop: 1,
              borderColor: "divider",
            }}
          >
            <RunPlotMacroButton />
          </Box>
        </Box>
      </FixedColumn>
      <ScrollableRegion>
        <Box sx={{ p: 2 }}>{showEmpty ? <MacroEmptyState /> : <MainView />}</Box>
      </ScrollableRegion>
    </HorizontalSplit>
  );
};

const sectionComponents = {
  home: HomeView,
  risk: RiskAssessmentView,
  macro: MacroeconomicView,
  workspace: WorkspaceView,
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
          <Sidebar width={sidebarWidth} />
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
