import React from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Paper } from "@mui/material";

import ScrollableRegion from "../primitives/ScrollableRegion";

const HomeView = () => {
  const { t } = useTranslation();
  return (
    <ScrollableRegion>
      <Box sx={{ p: 4 }}>
        <Paper sx={{ maxWidth: 800, p: 4, mx: "auto" }}>
          <Typography variant="h4" gutterBottom>
            {t("application_title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("welcome_title")}
          </Typography>
        </Paper>
      </Box>
    </ScrollableRegion>
  );
};

export default HomeView;
