import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Tabs, Tab, Paper } from "@mui/material";

import useUIStore from "../../store/useUIStore";
import SubTabActions from "./SubTabActions";
import { TAB_CONFIG, RISK_SUB_TABS } from "./tabs";

// Renders the sub-tab strip beneath the main tabs. Sub-tabs come from the
// per-tab config; the Risk tab additionally exposes a sibling toolbar
// (`<SubTabActions>`) with Save Scenario / Save Map | Save Chart buttons.
// Those buttons used to live inside `<Tabs>` with absolute positioning
// (#249); keeping `<Tabs>` tab-only fixes the a11y issue (toolbar buttons
// were being announced as tabs) and drops the layout hack.
const MainSubTabs = () => {
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const setSelectedSubTab = useUIStore((s) => s.setSelectedSubTab);
  const setActiveViewControl = useUIStore((s) => s.setActiveViewControl);
  const { t } = useTranslation();

  const handleSubTabChange = (event, newValue) => {
    setSelectedSubTab(newValue);
    // Set the active view to display_chart if the Adaptation sub-tab is
    // selected on the Risk tab. The display_map is not currently
    // available for that sub-tab.
    if (newValue === RISK_SUB_TABS.ADAPTATION) {
      setActiveViewControl("display_chart");
    }
  };

  const configSubTabs = TAB_CONFIG[selectedTab]?.subTabs ?? [];
  if (configSubTabs.length === 0) {
    return null; // This main tab does not have subtabs
  }

  return (
    <Paper
      square
      sx={{
        position: "fixed",
        top: 16,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        width: "100%",
        bgcolor: "primary.light",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Tabs
            value={selectedSubTab}
            onChange={handleSubTabChange}
            aria-label={`sub navigation tabs for main tab ${selectedTab}`}
            textColor="inherit"
            indicatorColor="secondary"
            variant="fullWidth"
            centered
            sx={{
              minHeight: 24,
              // Selected tab keeps white-on-primary.main; primary.main was darkened
              // in #121 (now 4.94:1 with white). Unselected tab switched from white
              // to text.primary because white-on-primary.light was 1.87:1.
              ".Mui-selected": { bgcolor: "primary.main", color: "common.white" },
              ".MuiTab-root": {
                color: "text.primary",
                fontSize: "0.875rem",
                minHeight: 24,
                py: 0.75,
                px: 1.5,
              },
              ".MuiTabs-indicator": {
                height: 2,
              },
              ".MuiTab-root:not(.Mui-selected)": { bgcolor: "primary.light" },
            }}
          >
            {configSubTabs.map((subTab, index) => (
              <Tab key={subTab.key ?? index} label={t(subTab.labelKey)} sx={{ minHeight: 24 }} />
            ))}
          </Tabs>
        </Box>
        <SubTabActions />
      </Box>
    </Paper>
  );
};

export default MainSubTabs;
