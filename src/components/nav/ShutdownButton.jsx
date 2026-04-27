import React from "react";
import { useTranslation } from "react-i18next";

import IconButton from "@mui/material/IconButton";
import LogoutIcon from "@mui/icons-material/Logout";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onShutdownClick = () => {
  RiskWiseClient.shutdown();
};

const ShutdownButton = () => {
  const { t } = useTranslation();
  return (
    <>
      <IconButton onClick={onShutdownClick} color="inherit" aria-label={t("nav_shutdown_aria")}>
        <LogoutIcon style={{ color: "var(--mui-palette-error-dark)" }} />
      </IconButton>
    </>
  );
};

export default ShutdownButton;
