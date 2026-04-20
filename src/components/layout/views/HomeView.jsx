import React from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Paper } from "@mui/material";

const HomeView = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 4, flexGrow: 1, overflow: "auto" }}>
      <Paper sx={{ maxWidth: 800, p: 4, mx: "auto" }}>
        <Typography variant="h4" gutterBottom>
          {t("application_title")}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t("welcome_title")}
        </Typography>
      </Paper>
    </Box>
  );
};

export default HomeView;
