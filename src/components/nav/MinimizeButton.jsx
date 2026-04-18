import React from "react";

import IconButton from "@mui/material/IconButton";
import MinimizeIcon from "@mui/icons-material/Minimize";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onMinimizelick = () => {
  RiskWiseClient.minimize();
};

const ShutdownButton = () => {
  return (
    <>
      <IconButton onClick={onMinimizelick} color="inherit" aria-label="Minimize">
        <MinimizeIcon />
      </IconButton>
    </>
  );
};

export default ShutdownButton;
