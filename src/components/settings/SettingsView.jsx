import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";

import CustomDataSection from "./CustomDataSection";
import CREDDataSection from "./CREDDataSection";

const TABS = [
  { id: "custom-data", labelKey: "settings_tab_custom_data" },
  { id: "cred-data", labelKey: "settings_tab_cred_data" },
  { id: "measures", labelKey: "settings_tab_measures" },
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
    <Box sx={{ p: 3, flexGrow: 1, overflow: "auto" }}>
      <Typography variant="h4" gutterBottom>
        {t("sidebar_settings")}
      </Typography>
      <Paper variant="outlined" sx={{ display: "flex", minHeight: 480 }}>
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
        <Box role="tabpanel" sx={{ p: 3, flexGrow: 1, overflow: "auto" }}>
          {activeTab === "custom-data" && <CustomDataSection />}
          {activeTab === "cred-data" && <CREDDataSection />}
          {activeTab === "measures" && (
            <PlaceholderPanel
              titleKey="settings_tab_measures"
              bodyKey="settings_measures_placeholder"
            />
          )}
          {activeTab === "about" && (
            <PlaceholderPanel titleKey="settings_tab_about" bodyKey="settings_about_body" />
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default SettingsView;
