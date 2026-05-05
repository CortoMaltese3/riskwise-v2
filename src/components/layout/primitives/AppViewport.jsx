import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

import { TOP_BAR_HEIGHT } from "../Sidebar";

// AppViewport is the outermost shell mandated by docs/reference/ui-design-spec.md
// § Single-view rule: the window must never produce a page-level scrollbar.
// The `print` opt-out (§ Print) is the explicit exception used by
// ScenarioPrintView so its output can flow across printed pages.

const LOCKED_STYLE = {
  height: "100vh",
  overflow: "hidden",
  boxSizing: "border-box",
};

const LOCKED_SX = {
  display: "flex",
  pt: `${TOP_BAR_HEIGHT}px`,
};

const AppViewport = ({ children, print = false, className }) => {
  if (print) {
    return (
      <Box component="div" data-primitive="app-viewport" data-mode="print" className={className}>
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="div"
      data-primitive="app-viewport"
      data-mode="locked"
      className={className}
      style={LOCKED_STYLE}
      sx={LOCKED_SX}
    >
      {children}
    </Box>
  );
};

AppViewport.propTypes = {
  children: PropTypes.node,
  print: PropTypes.bool,
  className: PropTypes.string,
};

export default AppViewport;
