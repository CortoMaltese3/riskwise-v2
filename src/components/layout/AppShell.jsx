import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@mui/material";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
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
import { useMacroTools } from "../../utils/macroTools";
import { TABS, RISK_SUB_TABS, isValidTab } from "../main/tabs";

const sectionToTab = {
  home: TABS.PARAMETERS,
  risk: TABS.RISK,
  macro: TABS.MACRO,
  workspace: TABS.REPORTS,
  settings: TABS.PARAMETERS,
};

const RISK_LEFT_PANEL_WIDTH = 280;
const RISK_RESULTS_PANEL_WIDTH = 260;
const MACRO_LEFT_PANEL_WIDTH = 280;

export const RiskAssessmentView = () => {
  const { t } = useTranslation();
  const selectedTab = useUIStore((s) => s.selectedTab);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const showRunButton =
    selectedTab === TABS.PARAMETERS ||
    (selectedTab === TABS.RISK && selectedSubTab === RISK_SUB_TABS.RISK);
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
            <Box sx={{ pt: 2, px: 1, pb: 1 }}>
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
        <Box
          sx={{
            pt: 2,
            px: 2,
            pb: 2,
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
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
            <Box sx={{ pt: 2, px: 1, pb: 1 }}>
              <ResultsView />
            </Box>
          </ScrollableRegion>
        </Box>
      </FixedColumn>
    </HorizontalSplit>
  );
};

const MacroeconomicView = () => {
  const credOutputData = useResultsStore((s) => s.credOutputData);
  const { loadCREDOutputData } = useMacroTools();

  // Sidebar-driven nav doesn't go through MainTabs, so the legacy tab-change
  // CRED fetch trigger never fires. Fetch on first activation if the cache
  // is empty.
  useEffect(() => {
    if (!credOutputData || credOutputData.length === 0) {
      loadCREDOutputData();
    }
  }, [credOutputData, loadCREDOutputData]);

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
            <Box sx={{ pt: 2, px: 1, pb: 1 }}>
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
        <Box
          sx={{
            pt: 2,
            px: 2,
            pb: 2,
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MainView />
        </Box>
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

const CHROME_COLUMN_SX = {
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  minWidth: 0,
};

const MAIN_PANE_SX = { display: "flex", flexDirection: "column", height: "100%" };

const AppShell = () => {
  const { t } = useTranslation();
  const activeSection = useUIStore((s) => s.activeSection);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    const tab = sectionToTab[activeSection];
    if (isValidTab(tab)) setSelectedTab(tab);
  }, [activeSection, setSelectedTab]);

  const Section = sectionComponents[activeSection] || HomeView;
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <AppViewport>
      <TopBar />
      <Box sx={CHROME_COLUMN_SX}>
        <EngineStatusBanner />
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
              sx={MAIN_PANE_SX}
            >
              <Section />
            </Box>
          </ScrollableRegion>
        </HorizontalSplit>
      </Box>
      <UpdateDialog />
      <OfflineIndicator />
    </AppViewport>
  );
};

export default AppShell;
