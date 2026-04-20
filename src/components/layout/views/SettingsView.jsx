import React from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Paper } from "@mui/material";

const SettingsView = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 4, flexGrow: 1, overflow: "auto" }}>
      <Paper sx={{ maxWidth: 800, p: 4, mx: "auto" }}>
        <Typography variant="h4" gutterBottom>
          {t("sidebar_settings")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("sidebar_settings_placeholder")}
        </Typography>
      </Paper>
    </Box>
  );
};

export default SettingsView;
