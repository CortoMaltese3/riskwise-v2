/**
 * Shared sx fragments for the scenario-configuration input cards. Centralising
 * them here keeps the per-card components free of hex literals (issue #6) and
 * gives Phase 1 a single place to evolve the pattern once design tokens land.
 *
 * `state` is a key of `theme.palette.inputCard` ("default" | "valid" |
 * "invalid" | "neutral").
 */

import { layoutTransition } from "../../theme/theme";

// Per ui-design-spec § Density.
export const INPUT_CARD_HEIGHT = 110;

// Shrunk from MUI h6 default (1.25rem / line-height 1.6) so two-line titles
// like "Exposure of Non-Economic Assets" fit inside INPUT_CARD_HEIGHT without
// pushing the disabled TextField past the card edge. Components keep
// `variant="h6"` for the heading semantics + class name asserted by
// inputCardUniformity.test.jsx; this sx only overrides the visual size.
export const cardTitleSx = {
  fontSize: "1rem",
  lineHeight: 1.3,
  fontWeight: 600,
};

export const getInputCardSx = (state, { clicked = false } = {}) => ({
  cursor: "pointer",
  bgcolor: (theme) => theme.palette.inputCard[state],
  transition: layoutTransition(["background-color", "transform"]),
  display: "flex",
  flexDirection: "column",
  height: INPUT_CARD_HEIGHT,
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
