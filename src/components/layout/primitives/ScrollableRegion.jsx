import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

// ScrollableRegion is the only primitive that introduces an internal
// scrollbar. Per docs/reference/ui-design-spec.md § Single-view rule, regions
// that exceed their budget show their own scrollbar — never the page's. The
// `print` opt-out drops the overflow constraint so ScenarioPrintView can flow
// across printed pages.

const LOCKED_STYLE = { minHeight: 0 };

// Subtle scrollbar styling. The default Chromium scrollbar is a thick grey
// bar that draws the eye and breaks the calm of the surrounding chrome —
// especially on the home view where the right column scrolls inside an
// otherwise-quiet card grid. Use a thin, semi-transparent thumb that picks
// up the active text colour so it stays legible in both light and dark
// modes without becoming a focal element. Track is transparent so the
// underlying surface shows through.
const SCROLLBAR_SX = {
  scrollbarWidth: "thin",
  scrollbarColor: (theme) => `${theme.palette.action.disabled} transparent`,
  "&::-webkit-scrollbar": { width: 8, height: 8 },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: (theme) => theme.palette.action.disabled,
    borderRadius: 4,
  },
  "&::-webkit-scrollbar-thumb:hover": {
    backgroundColor: (theme) => theme.palette.action.active,
  },
};

const AXIS_SX = {
  y: { flexGrow: 1, overflowX: "hidden", overflowY: "auto", ...SCROLLBAR_SX },
  x: { flexGrow: 1, overflowX: "auto", overflowY: "hidden", ...SCROLLBAR_SX },
  both: { flexGrow: 1, overflow: "auto", ...SCROLLBAR_SX },
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
