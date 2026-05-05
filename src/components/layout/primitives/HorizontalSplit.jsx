import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

// HorizontalSplit is the flex row primitive used inside AppViewport. It owns
// the `minHeight: 0` propagation that lets nested ScrollableRegion children
// scroll internally without leaking a page-level scrollbar (see
// docs/reference/ui-design-spec.md § Single-view rule). The `print` opt-out
// drops viewport-math so the same composition can render in ScenarioPrintView.

const PRINT_SX = { display: "flex", flexDirection: "row" };

const LOCKED_STYLE = { minHeight: 0 };
const LOCKED_SX = {
  display: "flex",
  flexDirection: "row",
  flexGrow: 1,
  "& > *": { minHeight: 0 },
};

const HorizontalSplit = ({ children, print = false, className }) => {
  if (print) {
    return (
      <Box
        component="div"
        data-primitive="horizontal-split"
        data-mode="print"
        className={className}
        sx={PRINT_SX}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="div"
      data-primitive="horizontal-split"
      data-mode="locked"
      className={className}
      style={LOCKED_STYLE}
      sx={LOCKED_SX}
    >
      {children}
    </Box>
  );
};

HorizontalSplit.propTypes = {
  children: PropTypes.node,
  print: PropTypes.bool,
  className: PropTypes.string,
};

export default HorizontalSplit;
