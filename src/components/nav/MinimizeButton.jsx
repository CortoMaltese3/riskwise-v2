import React from "react";
import { useTranslation } from "react-i18next";

import IconButton from "@mui/material/IconButton";
import MinimizeIcon from "@mui/icons-material/Minimize";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onMinimizelick = () => {
  RiskWiseClient.minimize();
};

const ShutdownButton = () => {
  const { t } = useTranslation();
  return (
    <>
      <IconButton onClick={onMinimizelick} color="inherit" aria-label={t("nav_minimize_aria")}>
        <MinimizeIcon />
      </IconButton>
    </>
  );
};

export default ShutdownButton;
