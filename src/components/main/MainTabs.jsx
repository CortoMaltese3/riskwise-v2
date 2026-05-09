import React from "react";
import { useTranslation } from "react-i18next";

import { AppBar, Box, Tabs, Tab } from "@mui/material";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import MacroIcon from "@mui/icons-material/Assessment";
import PaymentsIcon from "@mui/icons-material/Payments";
import TuneIcon from "@mui/icons-material/Tune";

import { useMacroTools } from "../../utils/macroTools";
import { useReportTools } from "../../utils/reportTools";
import MainSubTabs from "./MainSubTabs";
import { TABS, ORDERED_TABS, TAB_CONFIG } from "./tabs";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { TOP_BAR_HEIGHT } from "../layout/Sidebar";

// Icons are colocated with the tab id rather than living in TAB_CONFIG
// because tabs.js stays JSX-free (it is also imported by the store and
// pure helpers).
const TAB_ICONS = {
  [TABS.PARAMETERS]: <TuneIcon sx={{ fontSize: "1rem" }} />,
  [TABS.RISK]: <PaymentsIcon />,
  [TABS.MACRO]: <MacroIcon />,
  [TABS.REPORTS]: <ContentPasteIcon />,
};

const MainTabs = () => {
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const credOutputData = useResultsStore((s) => s.credOutputData);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
  const setSelectedSubTab = useUIStore((s) => s.setSelectedSubTab);
  const { fetchReports } = useReportTools();
  const { loadCREDOutputData } = useMacroTools();
  const { t } = useTranslation();

  const onFetchReportsHandler = async () => {
    await fetchReports();
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
    if (newValue === TABS.REPORTS) {
      onFetchReportsHandler();
    }
    if (newValue === TABS.MACRO && (!credOutputData || credOutputData.length === 0)) {
      loadCREDOutputData();
    }
    setSelectedSubTab(0);
  };

  return (
    <Box sx={{ bgcolor: "primary.light" }}>
      <AppBar
        position="fixed"
        sx={{
          bgcolor: "primary.light",
          top: `${TOP_BAR_HEIGHT}px`,
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          aria-label="main navigation tabs"
          textColor="inherit"
          indicatorColor="secondary"
          centered // Center the tabs within the AppBar
          sx={{
            ".Mui-selected": { bgcolor: "primary.dark", color: "common.white" },
            ".MuiTab-root": { color: "common.white" }, // Text color for all main tabs
          }}
        >
          {ORDERED_TABS.map((tabId) => (
            <Tab
              key={tabId}
              value={tabId}
              icon={TAB_ICONS[tabId]}
              iconPosition="start"
              label={t(TAB_CONFIG[tabId].sectionTitleKey)}
              sx={{ display: "flex", alignItems: "center", minHeight: 48 }}
              disabled={tabId === TABS.MACRO && selectedAppOption === "explore"}
            />
          ))}
        </Tabs>
      </AppBar>
      <MainSubTabs />
    </Box>
  );
};

export default MainTabs;
