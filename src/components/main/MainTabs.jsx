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
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { TOP_BAR_HEIGHT } from "../layout/Sidebar";

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
    if (newValue === 3) {
      onFetchReportsHandler();
    }
    if (newValue === 2 && (!credOutputData || credOutputData.length === 0)) {
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
          <Tab
            icon={<TuneIcon sx={{ fontSize: "1rem" }} />}
            iconPosition="start"
            label={t("main_section_title_parameters")}
            sx={{ display: "flex", alignItems: "center", minHeight: 48 }}
          />
          <Tab
            icon={<PaymentsIcon />}
            iconPosition="start"
            label={t("main_section_title_economic_non_economic")}
            sx={{ display: "flex", alignItems: "center", minHeight: 48 }}
          />
          <Tab
            icon={<MacroIcon />}
            iconPosition="start"
            label={t("main_section_title_macroeconomic")}
            sx={{ display: "flex", alignItems: "center", minHeight: 48 }}
            disabled={selectedAppOption === "explore"}
          />
          <Tab
            icon={<ContentPasteIcon />}
            iconPosition="start"
            label={t("main_section_title_outputs")}
            sx={{ display: "flex", alignItems: "center", minHeight: 48 }}
          />
        </Tabs>
      </AppBar>
      <MainSubTabs />
    </Box>
  );
};

export default MainTabs;
