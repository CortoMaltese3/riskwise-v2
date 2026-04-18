/**
 * Shared sx fragments for the scenario-configuration input cards. Centralising
 * them here keeps the per-card components free of hex literals (issue #6) and
 * gives Phase 1 a single place to evolve the pattern once design tokens land.
 *
 * `state` is a key of `theme.palette.inputCard` ("default" | "valid" |
 * "invalid" | "neutral").
 */

export const getInputCardSx = (state, { clicked = false } = {}) => ({
  cursor: "pointer",
  bgcolor: (theme) => theme.palette.inputCard[state],
  transition: "background-color 0.3s, transform 0.1s",
  "&:hover": {
    bgcolor: (theme) => theme.palette.inputCard.hover,
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
