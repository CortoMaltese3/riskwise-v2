/**
 * Shared sx fragments for the scenario-configuration input cards. Centralising
 * them here keeps the per-card components free of hex literals and gives a
 * single place to evolve the pattern.
 *
 * `state` is one of "default" | "valid" | "invalid" | "neutral", each
 * resolved to a token in the semantic palette (#298):
 *   default → primary.bgStrong   (one step deeper than the panel `primary.bg`
 *                                 so the card sits visibly on the panel)
 *   valid   → feedback.success.bg
 *   invalid → feedback.error.bg
 *   neutral → surface.subdued
 */

import { layoutTransition } from "../../theme/theme";

// Per ui-design-spec § Density. Sized to fit a two-line title plus the
// disabled TextField with a few px of breathing room. Paired with the reduced
// CardContent `padding: 1` below; if either changes, re-check that 2-line
// titles ("Exposure of Non-Economic Assets", "Macroeconomic Variable") still
// fit without the title hugging the top edge — the centered flex layout
// pushes overflow to both ends, so a too-short card reads as "no top margin".
export const INPUT_CARD_HEIGHT = 116;

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

const stateBgcolor = {
  default: "primary.bgStrong",
  valid: "feedback.success.bg",
  invalid: "feedback.error.bg",
  neutral: "surface.subdued",
};

// Resolve a `palette.category.<key>` token. `null` (Custom upload before the
// user picks a category) falls through to the grey `custom` swatch.
const PALETTE_KEY_BY_CATEGORY = { economic: "economic", non_economic: "nonEconomic" };
export const categoryPaletteKey = (category) => PALETTE_KEY_BY_CATEGORY[category] ?? "custom";

export const getInputCardSx = (state, { clicked = false } = {}) => ({
  cursor: "pointer",
  bgcolor: stateBgcolor[state],
  transition: layoutTransition(["background-color", "transform"]),
  display: "flex",
  flexDirection: "column",
  height: INPUT_CARD_HEIGHT,
  "&:hover": {
    bgcolor: "action.hover",
  },
  ".MuiCardContent-root": {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  ".MuiCardContent-root:last-child": { padding: 1 },
  transform: clicked ? "scale(0.97)" : "scale(1)",
});

export const disabledFieldSx = {
  // Apply the disabled fill to the outer rounded `OutlinedInput` slot so it
  // inherits the notched-outline border-radius. Styling the inner native
  // `<input>` instead leaves a square grey rectangle peeking behind the pill,
  // which shows up clearly on the neutral-state card (#285).
  //
  // The notched-outline `<fieldset>` border is hidden because MUI's default
  // `Mui-disabled` outline is a translucent neutral that, on a dark card,
  // glows against the surface and reads as a "radiant" pill edge — making
  // the field look brighter than its actual fill. With the outline removed,
  // only the solid `action.disabledBackground` fill defines the pill.
  ".MuiOutlinedInput-root.Mui-disabled": {
    bgcolor: "action.disabledBackground",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
  },
  ".MuiInputBase-input.Mui-disabled": {
    WebkitTextFillColor: (theme) => theme.palette.text.disabled,
    padding: 1,
  },
};
