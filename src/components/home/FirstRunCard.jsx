import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Paper, Stack, Typography } from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";

import useStore from "../../store";

const PAPER_SX = {
  p: 4,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  gap: 2,
};

const FirstRunCard = () => {
  const { t } = useTranslation();
  const setActiveSection = useStore((s) => s.setActiveSection);

  return (
    <Paper variant="outlined" sx={PAPER_SX} data-testid="home-firstrun-card">
      <RocketLaunchIcon color="primary" sx={{ fontSize: 48 }} />
      <Stack spacing={1} alignItems="center">
        <Typography variant="h6" component="h3">
          {t("home_firstrun_title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
          {t("home_firstrun_body")}
        </Typography>
      </Stack>
      <Button variant="contained" size="large" onClick={() => setActiveSection("risk")}>
        {t("home_firstrun_cta")}
      </Button>
    </Paper>
  );
};

export default FirstRunCard;
