import React from "react";
import { useTranslation } from "react-i18next";

import IconButton from "@mui/material/IconButton";
import RefreshIcon from "@mui/icons-material/Refresh";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onRefreshClick = () => {
  RiskWiseClient.reload();
};

const ReloadButton = () => {
  const { t } = useTranslation();
  return (
    <>
      <IconButton onClick={onRefreshClick} color="inherit" aria-label={t("nav_refresh_aria")}>
        <RefreshIcon />
      </IconButton>
    </>
  );
};

export default ReloadButton;
