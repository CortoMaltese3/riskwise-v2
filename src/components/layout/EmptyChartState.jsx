import React from "react";
import PropTypes from "prop-types";

import { Box, Typography } from "@mui/material";

const EmptyChartState = ({ icon: Icon, message, hint, "data-testid": testId, minHeight = 320 }) => (
  <Box
    data-testid={testId}
    aria-live="polite"
    sx={{
      width: "100%",
      height: "100%",
      minHeight,
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
    {Icon ? <Icon aria-hidden="true" sx={{ fontSize: 64, opacity: 0.6 }} /> : null}
    <Typography variant="body1">{message}</Typography>
    {hint ? (
      <Typography variant="body2" sx={{ opacity: 0.75, maxWidth: 360 }}>
        {hint}
      </Typography>
    ) : null}
  </Box>
);

EmptyChartState.propTypes = {
  icon: PropTypes.elementType,
  message: PropTypes.node.isRequired,
  hint: PropTypes.node,
  "data-testid": PropTypes.string,
  minHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export default EmptyChartState;
