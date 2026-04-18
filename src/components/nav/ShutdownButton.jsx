import React from "react";

import IconButton from "@mui/material/IconButton";
import LogoutIcon from "@mui/icons-material/Logout";

import RiskWiseClient from "../../lib/RiskWiseClient";

const onShutdownClick = () => {
  RiskWiseClient.shutdown();
};

const ShutdownButton = () => {
  return (
    <>
      <IconButton onClick={onShutdownClick} color="inherit" aria-label="Shutdown">
        <LogoutIcon style={{ color: "#ba000d" }} />
      </IconButton>
    </>
  );
};

export default ShutdownButton;
