import React from "react";

import IconButton from "@mui/material/IconButton";
import RefreshIcon from "@mui/icons-material/Refresh";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onRefreshClick = () => {
  RiskWiseClient.reload();
};

const ReloadButton = () => {
  return (
    <>
      <IconButton onClick={onRefreshClick} color="inherit" aria-label="Refresh">
        <RefreshIcon />
      </IconButton>
    </>
  );
};

export default ReloadButton;
