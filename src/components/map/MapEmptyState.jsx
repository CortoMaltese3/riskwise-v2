import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";

const MapEmptyState = ({ "data-testid": testId = "map-empty-state" }) => {
  const { t } = useTranslation();
  return (
    <Box
      data-testid={testId}
      aria-live="polite"
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: 3,
        textAlign: "center",
        color: (theme) => theme.palette.text.secondary,
      }}
    >
      <MapOutlinedIcon aria-hidden="true" sx={{ fontSize: 64, opacity: 0.6 }} />
      <Typography variant="body1">{t("map_empty_state_message")}</Typography>
    </Box>
  );
};

MapEmptyState.propTypes = {
  "data-testid": PropTypes.string,
};

export default MapEmptyState;
