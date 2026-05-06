import React from "react";
import PropTypes from "prop-types";
import { Box, Paper, Stack, Typography } from "@mui/material";

const HEADER_SX = { mb: 1.5 };
const PAPER_SX = { p: 2.5, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 };
const BODY_SX = { flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" };

const HomeCard = ({ title, action, children, paperSx, "data-testid": dataTestId }) => (
  <Paper variant="outlined" sx={{ ...PAPER_SX, ...paperSx }} data-testid={dataTestId}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={HEADER_SX}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {action ? <Box>{action}</Box> : null}
    </Stack>
    <Box sx={BODY_SX}>{children}</Box>
  </Paper>
);

HomeCard.propTypes = {
  title: PropTypes.node.isRequired,
  action: PropTypes.node,
  children: PropTypes.node,
  paperSx: PropTypes.object,
  "data-testid": PropTypes.string,
};

export default HomeCard;
