import { describe, it, expect } from "vitest";
import theme, { MOTION_DURATION_MS, MOTION_EASING, layoutTransition } from "./theme";

// WCAG helpers below are intentionally duplicated in
// `scripts/check-color-contrast.js` (CommonJS, dependency-free) — keep the
// math in sync. Both implementations follow WCAG 2.1 § Relative Luminance.

// Relative luminance per WCAG 2.1. Expects `#RRGGBB`.
function relativeLuminance(hex) {
  const channels = hex
    .replace(/^#/, "")
    .match(/.{2}/g)
    .slice(0, 3)
    .map((h) => parseInt(h, 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [bright, dark] = la >= lb ? [la, lb] : [lb, la];
  return (bright + 0.05) / (dark + 0.05);
}

// Semantic palette slots (#298).
const CUSTOM_PALETTE_SLOTS = ["surface", "border", "feedback", "viz"];

// Legacy palette namespaces removed by #298. Asserted as undefined so a
// regression — re-introducing one — fails CI rather than silently shipping.
const REMOVED_PALETTE_SLOTS = [
  "inputCard",
  "header",
  "accent",
  "card",
  "tab",
  "mapControl",
  "tableHeader",
  "loader",
  "slider",
];

describe("theme — design tokens", () => {
  it("opts into CSS variables and Inter font", () => {
    // `cssVariables: true` causes MUI to expose palette entries under `theme.vars`
    // as CSS custom properties (e.g. `var(--mui-palette-primary-light)`). This
    // is the observable side effect rather than the config input.
    expect(theme.vars).toBeDefined();
    expect(theme.vars.palette.primary.light).toMatch(/^var\(--mui-palette-primary-light/);
    expect(theme.typography.fontFamily).toMatch(/Inter/);
  });

  it("exposes primary, background, and text palette tokens", () => {
    expect(theme.palette.primary.main).toBeDefined();
    expect(theme.palette.primary.contrastText).toBeDefined();
    expect(theme.palette.background.default).toBeDefined();
    expect(theme.palette.background.paper).toBeDefined();
    expect(theme.palette.text.primary).toBeDefined();
  });

  it("exposes the new #298 semantic palette tokens", () => {
    expect(theme.palette.primary.bg).toBeDefined();
    expect(theme.palette.primary.bgStrong).toBeDefined();
    expect(theme.palette.secondary.main).toBeDefined();
    expect(theme.palette.secondary.bg).toBeDefined();
    expect(theme.palette.surface.subdued).toBeDefined();
    expect(theme.palette.border.default).toBeDefined();
    expect(theme.palette.border.strong).toBeDefined();
    expect(theme.palette.text.disabled).toBeDefined();
    expect(theme.palette.feedback.success.main).toBeDefined();
    expect(theme.palette.feedback.success.bg).toBeDefined();
    expect(theme.palette.feedback.warning.main).toBeDefined();
    expect(theme.palette.feedback.error.main).toBeDefined();
    expect(theme.palette.feedback.info.main).toBeDefined();
    expect(theme.palette.viz.categorical).toHaveLength(6);
    expect(theme.palette.viz.positive).toBeDefined();
    expect(theme.palette.viz.neutral).toBeDefined();
    expect(theme.palette.viz.negative).toBeDefined();
    expect(theme.palette.viz.ramps.flood).toBeDefined();
    expect(theme.palette.viz.ramps.heatwave).toBeDefined();
    expect(theme.palette.viz.ramps.drought).toBeDefined();
    expect(theme.palette.viz.ramps.risk).toBeDefined();
    expect(theme.palette.viz.patternStroke).toBeDefined();
  });

  it("exposes a per-scheme pattern stroke for chart canvas-pattern overlays (#367)", () => {
    // Light mode keeps the historic dark stroke; dark mode flips to a white
    // stroke so the diagonal / cross / dots / horizontal textures painted by
    // `chartPatterns.js` stay visible on the darker bar fills.
    const lightStroke = theme.colorSchemes.light.palette.viz.patternStroke;
    const darkStroke = theme.colorSchemes.dark.palette.viz.patternStroke;
    expect(lightStroke).toMatch(/rgba\(0,\s*0,\s*0/);
    expect(darkStroke).toMatch(/rgba\(255,\s*255,\s*255/);
  });

  it("aliases palette.error.main to feedback.error.main", () => {
    // MUI built-ins (`<Alert severity="error">`, the form `error` state, etc.)
    // read from `palette.error.main`. Keeping it aliased to the semantic
    // feedback red avoids needing to migrate every MUI consumer.
    const lightError = theme.colorSchemes.light.palette.error;
    const lightFeedbackError = theme.colorSchemes.light.palette.feedback.error;
    expect(lightError.main).toBe(lightFeedbackError.main);
    const darkError = theme.colorSchemes.dark.palette.error;
    const darkFeedbackError = theme.colorSchemes.dark.palette.feedback.error;
    expect(darkError.main).toBe(darkFeedbackError.main);
  });

  it("sets a non-default shape radius", () => {
    expect(theme.shape.borderRadius).toBe(12);
  });

  it("exposes the canonical motion duration and easing", () => {
    // Spec § Motion: 150 ms / easeOut, applied to every layout transition.
    // Theme `transitions.duration.standard` is overridden so MUI internals
    // (MuiButtonBase ripple, Drawer slide) honour the same cadence.
    expect(MOTION_DURATION_MS).toBe(150);
    expect(MOTION_EASING).toMatch(/cubic-bezier/);
    expect(theme.transitions.duration.standard).toBe(150);
  });

  it("layoutTransition() composes the canonical duration + easing", () => {
    expect(layoutTransition(["transform"])).toBe(`transform 150ms ${MOTION_EASING}`);
    expect(layoutTransition(["background-color", "transform"])).toBe(
      `background-color 150ms ${MOTION_EASING}, transform 150ms ${MOTION_EASING}`
    );
    // Default argument keeps "all" as a sensible fallback for hover-state sx.
    expect(layoutTransition()).toBe(`all 150ms ${MOTION_EASING}`);
  });

  it("focus ring is owned by MuiButtonBase root override", () => {
    const root = theme.components?.MuiButtonBase?.styleOverrides?.root;
    expect(root).toBeDefined();
    const focusVisible = root["&:focus-visible"];
    expect(focusVisible.outline).toMatch(/2px solid/);
    expect(focusVisible.outlineOffset).toBe("2px");
  });

  it("MuiButton defaults flatten elevation and anchor contained min-width", () => {
    // Spec § Buttons (issue #285): theme owns button sizing. Contained CTAs
    // anchor at `minWidth: 140` so short labels don't shrink to a tab; small
    // contained buttons drop back to MUI's natural minimum for dense uses.
    const button = theme.components?.MuiButton;
    expect(button?.defaultProps?.disableElevation).toBe(true);
    expect(button?.styleOverrides?.contained?.minWidth).toBe(140);
    expect(button?.styleOverrides?.sizeSmall?.minWidth).toBe(0);
  });
});

describe("theme — color schemes", () => {
  // Issue #288: light/dark schemes share the same custom palette slots so
  // component `sx={{ bgcolor: "header.main" }}` keeps working in both modes.
  it("declares both light and dark color schemes", () => {
    expect(theme.colorSchemes?.light?.palette).toBeDefined();
    expect(theme.colorSchemes?.dark?.palette).toBeDefined();
  });

  it.each(CUSTOM_PALETTE_SLOTS)(
    "%s palette slot is defined under both light and dark schemes",
    (slot) => {
      expect(theme.colorSchemes.light.palette[slot]).toBeDefined();
      expect(theme.colorSchemes.dark.palette[slot]).toBeDefined();
    }
  );

  it.each(REMOVED_PALETTE_SLOTS)(
    "removed legacy slot %s is not present in either scheme (#298 regression guard)",
    (slot) => {
      expect(theme.colorSchemes.light.palette[slot]).toBeUndefined();
      expect(theme.colorSchemes.dark.palette[slot]).toBeUndefined();
      expect(theme.palette[slot]).toBeUndefined();
    }
  );

  it("light scheme keeps the canonical primary teal (no accidental drift)", () => {
    // Pixel-equivalence guard: the brand `main` and `dark` values are stable
    // through the #298 refactor so the existing UI looks unchanged.
    // `primary.light` is bumped from the previous `#8AC8D0` to `#9CCDDA` so
    // `primary.dark` (`#0E5A66`) on it clears WCAG 2.1 AA 4.5:1 — the previous
    // pair measured 4.07:1, blocking the `header` migration.
    const lightPrimary = theme.colorSchemes.light.palette.primary;
    expect(lightPrimary.main).toBe("#2F7A86");
    expect(lightPrimary.dark).toBe("#0E5A66");
    expect(lightPrimary.light).toBe("#9CCDDA");
    expect(lightPrimary.contrastText.toLowerCase()).toBe("#ffffff");
    expect(theme.colorSchemes.light.palette.background.default.toLowerCase()).toBe("#f8fafc");
    expect(theme.colorSchemes.light.palette.background.paper.toLowerCase()).toBe("#ffffff");
  });

  it("dark scheme uses dark backgrounds and light text", () => {
    const dark = theme.colorSchemes.dark.palette;
    expect(dark.background.default).toBe("#0F172A");
    expect(dark.background.paper).toBe("#1E293B");
    expect(dark.text.primary).toBe("#F1F5F9");
  });
});

describe("theme — WCAG AA contrast", () => {
  // Pairs must pass 4.5:1 for normal body text (WCAG 2.1 AA). The comprehensive
  // audit below covers every text-bearing palette pair under both schemes
  // (issue #289). The pair list was translated from the original #289 audit
  // table after #298 collapsed the legacy `card`/`inputCard`/`header`/`tab`/
  // `accent`/`mapControl`/`tableHeader`/`slider` namespaces into the seven
  // semantic namespaces — the table maps each removed slot onto its current
  // equivalent (e.g. `card.bg` → `primary.bgStrong`, `header.contrastText on
  // header.main` → `primary.contrastText on primary.main`, `accent.*` →
  // `secondary.*`, `tableHeader.main` → `primary.bgStrong`).
  const lightPalette = theme.colorSchemes.light.palette;
  const darkPalette = theme.colorSchemes.dark.palette;

  // Surfaces where the foreground is the scheme's normal body text — light
  // text on dark surfaces in dark mode, dark text on light surfaces in light
  // mode. These are surfaces that move *with* the scheme, so the same
  // foreground token (`text.primary`) gives the right pairing in both.
  const TEXT_PRIMARY_SURFACES = [
    "background.default",
    "background.paper",
    "primary.bg",
    "primary.bgStrong",
    "secondary.bg",
    "secondary.light",
    "surface.muted",
    "surface.subdued",
    "feedback.success.bg",
    "feedback.warning.bg",
    "feedback.error.bg",
    "feedback.info.bg",
  ];

  // Resolve a "namespace.slot" path against a palette object. Avoids
  // duplicating the same `(p) => p.foo.bar` accessor per pair.
  const resolveSlot = (palette, path) =>
    path.split(".").reduce((node, segment) => node[segment], palette);

  // Contrast-text-on-fill pairs. The third tuple element optionally restricts
  // the pair to one scheme — used for `primary.dark` (used as a *background*
  // only in light mode; in dark mode `primary.dark` reads as a foreground
  // against the pale `primary.light`).
  const CONTRAST_PAIRS = [
    ["primary.contrastText", "primary.main"],
    ["primary.contrastText", "primary.dark", "light"],
    ["primary.dark", "primary.light"], // TopBar header band, both schemes.
    ["secondary.contrastText", "secondary.main"],
    ["secondary.contrastText", "secondary.dark"],
    ["error.contrastText", "error.main"],
    ["error.contrastText", "error.dark"],
    ["category.economic.contrastText", "category.economic.main"],
    ["category.nonEconomic.contrastText", "category.nonEconomic.main"],
    ["category.custom.contrastText", "category.custom.main"],
  ];

  // Feedback `*.main` on `background.paper` — these are used as icon / badge
  // fills (text-bearing in dialogs and inline alerts), not as backgrounds.
  const FEEDBACK_MAIN_FOREGROUNDS = [
    "feedback.success.main",
    "feedback.warning.main",
    "feedback.error.main",
    "feedback.info.main",
  ];

  const SCHEMES = [
    ["light", lightPalette],
    ["dark", darkPalette],
  ];

  const textPrimaryPairs = SCHEMES.flatMap(([scheme, palette]) =>
    TEXT_PRIMARY_SURFACES.map((surface) => ({
      name: `[${scheme}] text.primary on ${surface}`,
      fg: palette.text.primary,
      bg: resolveSlot(palette, surface),
    }))
  );

  const textSecondaryPairs = SCHEMES.flatMap(([scheme, palette]) => [
    {
      name: `[${scheme}] text.secondary on background.default`,
      fg: palette.text.secondary,
      bg: palette.background.default,
    },
    {
      name: `[${scheme}] text.secondary on background.paper`,
      fg: palette.text.secondary,
      bg: palette.background.paper,
    },
  ]);

  const contrastPairs = SCHEMES.flatMap(([scheme, palette]) =>
    CONTRAST_PAIRS.filter(([, , onlyScheme]) => !onlyScheme || onlyScheme === scheme).map(
      ([fgPath, bgPath]) => ({
        name: `[${scheme}] ${fgPath} on ${bgPath}`,
        fg: resolveSlot(palette, fgPath),
        bg: resolveSlot(palette, bgPath),
      })
    )
  );

  const feedbackMainPairs = SCHEMES.flatMap(([scheme, palette]) =>
    FEEDBACK_MAIN_FOREGROUNDS.map((fgPath) => ({
      name: `[${scheme}] ${fgPath} on background.paper`,
      fg: resolveSlot(palette, fgPath),
      bg: palette.background.paper,
    }))
  );

  const pairs = [
    ...textPrimaryPairs,
    ...textSecondaryPairs,
    ...contrastPairs,
    ...feedbackMainPairs,
  ];

  it.each(pairs)("$name meets 4.5:1", ({ fg, bg }) => {
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  // Disabled-control text is intentionally low-contrast. WCAG 2.1 § 1.4.3
  // exempts disabled UI components from the 4.5:1 minimum — they're a
  // visual signal to the user that the control isn't interactive. This
  // assertion documents the exemption (and would catch a future swap that
  // accidentally pushed disabled text *above* the normal-text threshold,
  // which would erase the visual cue).
  it.each(SCHEMES)(
    "[%s] disabled text on action.disabledBackground is below AA by design",
    (_, palette) => {
      const ratio = contrastRatio(palette.text.disabled, palette.action.disabledBackground);
      expect(ratio).toBeLessThan(4.5);
    }
  );

  // VIZ_CATEGORICAL hues are rendered as chart bar / line fills sitting on
  // `background.paper` in both schemes (#367). Non-text contrast floor is
  // WCAG 2.1 § 1.4.11 (3:1) — each positional hue must clear it against
  // both papers so the categorical encoding stays distinguishable from the
  // surface in either mode.
  const NON_TEXT_RATIO = 3.0;
  const categoricalPairs = lightPalette.viz.categorical.flatMap((hex, idx) => [
    {
      name: `[viz] categorical[${idx}] (${hex}) on light background.paper`,
      fg: hex,
      bg: lightPalette.background.paper,
    },
    {
      name: `[viz] categorical[${idx}] (${hex}) on dark background.paper`,
      fg: hex,
      bg: darkPalette.background.paper,
    },
  ]);

  it.each(categoricalPairs)("$name meets 3:1 non-text", ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(NON_TEXT_RATIO);
  });
});
