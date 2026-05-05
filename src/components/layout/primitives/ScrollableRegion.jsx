import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

// ScrollableRegion is the only primitive that introduces an internal
// scrollbar. Per docs/reference/ui-design-spec.md § Single-view rule, regions
// that exceed their budget show their own scrollbar — never the page's. The
// `print` opt-out drops the overflow constraint so ScenarioPrintView can flow
// across printed pages.

const LOCKED_STYLE = { minHeight: 0 };

const AXIS_SX = {
  y: { flexGrow: 1, overflowX: "hidden", overflowY: "auto" },
  x: { flexGrow: 1, overflowX: "auto", overflowY: "hidden" },
  both: { flexGrow: 1, overflow: "auto" },
};

const ScrollableRegion = ({ children, print = false, axis = "y", className }) => {
  if (print) {
    return (
      <Box
        component="div"
        data-primitive="scrollable-region"
        data-mode="print"
        className={className}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="div"
      data-primitive="scrollable-region"
      data-mode="locked"
      data-axis={axis}
      className={className}
      style={LOCKED_STYLE}
      sx={AXIS_SX[axis]}
    >
      {children}
    </Box>
  );
};

ScrollableRegion.propTypes = {
  children: PropTypes.node,
  print: PropTypes.bool,
  axis: PropTypes.oneOf(["y", "x", "both"]),
  className: PropTypes.string,
};

export default ScrollableRegion;
