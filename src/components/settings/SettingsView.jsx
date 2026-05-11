import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";

import ScrollableRegion from "../layout/primitives/ScrollableRegion";
import CustomDataSection from "./CustomDataSection";
import CREDDataSection from "./CREDDataSection";
import DiagnosticsSection from "./DiagnosticsSection";
import ImportScenarioSection from "./ImportScenarioSection";
import MeasuresSection from "./MeasuresSection";
import OfflineSection from "./OfflineSection";
import ReportFormattingSection from "./ReportFormattingSection";
import UpdatesPanel from "./UpdatesPanel";

const TABS = [
  { id: "custom-data", labelKey: "settings_tab_custom_data" },
  { id: "import-scenario", labelKey: "settings_tab_import_scenario" },
  { id: "cred-data", labelKey: "settings_tab_cred_data" },
  { id: "measures", labelKey: "settings_tab_measures" },
  { id: "report-formatting", labelKey: "settings_tab_report_formatting" },
  { id: "updates", labelKey: "settings_tab_updates" },
  { id: "offline", labelKey: "settings_tab_offline" },
  { id: "diagnostics", labelKey: "settings_tab_diagnostics" },
  { id: "about", labelKey: "settings_tab_about" },
];

const PlaceholderPanel = ({ titleKey, bodyKey }) => {
  const { t } = useTranslation();
  return (
    <Stack spacing={1}>
      <Typography variant="h6">{t(titleKey)}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t(bodyKey)}
      </Typography>
    </Stack>
  );
};

const SettingsView = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("custom-data");

  return (
    <ScrollableRegion>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          {t("sidebar_settings")}
        </Typography>
        <Paper variant="outlined">
          <Stack direction="row" sx={{ minHeight: 480 }}>
            <Tabs
              orientation="vertical"
              value={activeTab}
              onChange={(_e, value) => setActiveTab(value)}
              aria-label={t("settings_tabs_aria")}
              sx={{
                borderRight: 1,
                borderColor: "divider",
                minWidth: 200,
                "& .MuiTab-root": { alignItems: "flex-start", textAlign: "left" },
              }}
            >
              {TABS.map((tab) => (
                <Tab key={tab.id} value={tab.id} label={t(tab.labelKey)} />
              ))}
            </Tabs>
            <Box role="tabpanel" sx={{ p: 3, flexGrow: 1 }}>
              {activeTab === "custom-data" && <CustomDataSection />}
              {activeTab === "import-scenario" && <ImportScenarioSection />}
              {activeTab === "cred-data" && <CREDDataSection />}
              {activeTab === "measures" && <MeasuresSection />}
              {activeTab === "report-formatting" && <ReportFormattingSection />}
              {activeTab === "updates" && <UpdatesPanel />}
              {activeTab === "offline" && <OfflineSection />}
              {activeTab === "diagnostics" && <DiagnosticsSection />}
              {activeTab === "about" && (
                <PlaceholderPanel titleKey="settings_tab_about" bodyKey="settings_about_body" />
              )}
            </Box>
          </Stack>
        </Paper>
      </Box>
    </ScrollableRegion>
  );
};

export default SettingsView;
