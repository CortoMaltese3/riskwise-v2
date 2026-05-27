import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

// FixedColumn renders a sidebar or panel column with a typed width. By default
// it introduces no overflow behaviour — internal scrolling belongs to a nested
// ScrollableRegion if the column needs it. The `print` opt-out drops
// viewport-math so ScenarioPrintView can render the same column without flex
// sizing constraints.
//
// The `resizable` opt-in renders a drag handle on the column's inner edge so a
// user can widen or narrow the panel between `minWidth` and `maxWidth`. The
// handle side is explicit (`handleSide`) because the affordance must face the
// central content: a left panel resizes from its right edge, a right panel
// from its left edge. We drive the width from JS rather than CSS `resize`
// because the native handle only ever sits in the bottom-right corner, which
// is unreachable on a right-hand panel.

const LOCKED_SX = { flexShrink: 0 };
const RESIZABLE_SX = { flexShrink: 0, position: "relative" };

const HANDLE_WIDTH = 16;
const HANDLE_HEIGHT = 64;
const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;

// The handle is a vertically-centred grip rather than a full-height strip so it
// does not sit on top of a panel's inner ScrollableRegion scrollbar (which runs
// the full height of the right edge) — only its midpoint is ever covered.
const HANDLE_SX = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  height: HANDLE_HEIGHT,
  width: HANDLE_WIDTH,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "col-resize",
  touchAction: "none",
  zIndex: 2,
  "&:focus-visible": { outline: "none" },
  "&:hover .fixed-column-grip, &:focus-visible .fixed-column-grip": {
    backgroundColor: "primary.main",
    height: 56,
  },
};

const GRIP_SX = {
  width: 6,
  height: 44,
  borderRadius: 3,
  backgroundColor: "action.active",
  transition: "background-color 120ms ease, height 120ms ease",
  pointerEvents: "none",
};

const resolveWidth = (width) => (typeof width === "number" ? `${width}px` : width);

const clamp = (value, min, max) => {
  let next = value;
  if (typeof min === "number") next = Math.max(next, min);
  if (typeof max === "number") next = Math.min(next, max);
  return next;
};

const FixedColumn = ({
  children,
  width,
  print = false,
  className,
  resizable = false,
  minWidth,
  maxWidth,
  handleSide = "right",
}) => {
  const [currentWidth, setCurrentWidth] = useState(() => (typeof width === "number" ? width : 0));

  // A handle on the left edge resizes in the opposite direction to the pointer
  // delta: dragging left should grow a right-hand panel.
  const direction = handleSide === "left" ? -1 : 1;

  const handleMouseDown = useCallback(
    (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = currentWidth;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) * direction;
        setCurrentWidth(clamp(startWidth + delta, minWidth, maxWidth));
      };
      const onUp = () => {
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [currentWidth, direction, minWidth, maxWidth]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      const pointerDelta = event.key === "ArrowRight" ? step : -step;
      const delta = pointerDelta * direction;
      setCurrentWidth((w) => clamp(w + delta, minWidth, maxWidth));
    },
    [direction, minWidth, maxWidth]
  );

  if (print) {
    return (
      <Box
        component="div"
        data-primitive="fixed-column"
        data-mode="print"
        className={className}
        style={{ width: resolveWidth(width) }}
      >
        {children}
      </Box>
    );
  }

  if (resizable) {
    return (
      <Box
        component="div"
        data-primitive="fixed-column"
        data-mode="resizable"
        className={className}
        style={{ width: `${currentWidth}px`, minHeight: 0 }}
        sx={RESIZABLE_SX}
      >
        {children}
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={currentWidth}
          aria-valuemin={typeof minWidth === "number" ? minWidth : undefined}
          aria-valuemax={typeof maxWidth === "number" ? maxWidth : undefined}
          tabIndex={0}
          data-resize-handle={handleSide}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
          sx={{ ...HANDLE_SX, [handleSide]: 0 }}
        >
          <Box className="fixed-column-grip" sx={GRIP_SX} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="div"
      data-primitive="fixed-column"
      data-mode="locked"
      className={className}
      style={{ width: resolveWidth(width), minHeight: 0 }}
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
  resizable: PropTypes.bool,
  minWidth: PropTypes.number,
  maxWidth: PropTypes.number,
  handleSide: PropTypes.oneOf(["left", "right"]),
};

export default FixedColumn;
