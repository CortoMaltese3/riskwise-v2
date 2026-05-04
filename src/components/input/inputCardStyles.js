/**
 * Shared sx fragments for the scenario-configuration input cards. Centralising
 * them here keeps the per-card components free of hex literals (issue #6) and
 * gives Phase 1 a single place to evolve the pattern once design tokens land.
 *
 * `state` is a key of `theme.palette.inputCard` ("default" | "valid" |
 * "invalid" | "neutral").
 */

// Minimum card height keeps every scenario-input card the same size whether
// it is showing only its label or label + selected-value TextField. Sized to
// fit a label (incl. one wrap) + readonly TextField without clipping.
export const INPUT_CARD_MIN_HEIGHT = 110;

export const getInputCardSx = (state, { clicked = false } = {}) => ({
  cursor: "pointer",
  bgcolor: (theme) => theme.palette.inputCard[state],
  transition: "background-color 0.3s, transform 0.1s",
  display: "flex",
  flexDirection: "column",
  minHeight: INPUT_CARD_MIN_HEIGHT,
  "&:hover": {
    bgcolor: (theme) => theme.palette.inputCard.hover,
  },
  ".MuiCardContent-root": {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  ".MuiCardContent-root:last-child": { padding: 2 },
  transform: clicked ? "scale(0.97)" : "scale(1)",
});

export const disabledFieldSx = {
  ".MuiInputBase-input.Mui-disabled": {
    WebkitTextFillColor: (theme) => theme.palette.inputCard.disabledText,
    bgcolor: (theme) => theme.palette.inputCard.disabledBg,
    padding: 1,
  },
};
