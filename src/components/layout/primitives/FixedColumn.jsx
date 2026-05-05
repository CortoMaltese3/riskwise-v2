import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

// FixedColumn renders a non-scrolling sidebar or panel column with a typed
// width. It deliberately introduces no overflow behaviour — internal scrolling
// belongs to a nested ScrollableRegion if the column needs it. The `print`
// opt-out drops viewport-math so ScenarioPrintView can render the same column
// without flex sizing constraints.

const LOCKED_SX = { flexShrink: 0 };

const resolveWidth = (width) => (typeof width === "number" ? `${width}px` : width);

const FixedColumn = ({ children, width, print = false, className }) => {
  const resolved = resolveWidth(width);

  if (print) {
    return (
      <Box
        component="div"
        data-primitive="fixed-column"
        data-mode="print"
        className={className}
        style={{ width: resolved }}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="div"
      data-primitive="fixed-column"
      data-mode="locked"
      className={className}
      style={{ width: resolved, minHeight: 0 }}
      sx={LOCKED_SX}
    >
      {children}
    </Box>
  );
};

FixedColumn.propTypes = {
  children: PropTypes.node,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  print: PropTypes.bool,
  className: PropTypes.string,
};

export default FixedColumn;
