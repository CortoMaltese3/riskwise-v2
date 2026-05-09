import React from "react";
import { useTranslation } from "react-i18next";

import { AppBar, Box, Tabs, Tab } from "@mui/material";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import MacroIcon from "@mui/icons-material/Assessment";
import PaymentsIcon from "@mui/icons-material/Payments";
import TuneIcon from "@mui/icons-material/Tune";

import MainSubTabs from "./MainSubTabs";
import { TABS, ORDERED_TABS, TAB_CONFIG } from "./tabs";
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
  const selectedTab = useUIStore((s) => s.selectedTab);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
  const setSelectedSubTab = useUIStore((s) => s.setSelectedSubTab);
  const { t } = useTranslation();

  // Click handler is intentionally fetch-free: it only updates tab state.
  // Tab-entry data fetches (CRED data for Macro, scenario list for Reports)
  // live in the views that consume them, keyed off mount/activation. This
  // keeps caching policy in one place per dataset rather than splitting it
  // between this handler and the store's setSelectedTab. See #248.
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
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
