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

const CUSTOM_PALETTE_SLOTS = [
  "inputCard",
  "header",
  "accent",
  "card",
  "surface",
  "tab",
  "mapControl",
  "tableHeader",
  "loader",
  "slider",
];

describe("theme — design tokens", () => {
  it("opts into CSS variables and Inter font", () => {
    // `cssVariables: true` causes MUI to expose palette entries under `theme.vars`
    // as CSS custom properties (e.g. `var(--mui-palette-header-main)`). This is
    // the observable side effect rather than the config input.
    expect(theme.vars).toBeDefined();
    expect(theme.vars.palette.header.main).toMatch(/^var\(--mui-palette-header-main/);
    expect(theme.typography.fontFamily).toMatch(/Inter/);
  });

  it("exposes primary, background, header, and inputCard palette tokens", () => {
    expect(theme.palette.primary.main).toBeDefined();
    expect(theme.palette.primary.contrastText).toBeDefined();
    expect(theme.palette.background.default).toBeDefined();
    expect(theme.palette.background.paper).toBeDefined();
    expect(theme.palette.header.main).toBeDefined();
    expect(theme.palette.header.contrastText).toBeDefined();
    expect(theme.palette.inputCard.default).toBeDefined();
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

  it("light scheme keeps the canonical primary teal (no accidental drift)", () => {
    // Pixel-equivalence guard: the light values match the pre-#288 palette so
    // the existing UI is visually unchanged after the colorSchemes refactor.
    const lightPrimary = theme.colorSchemes.light.palette.primary;
    expect(lightPrimary.main).toBe("#2F7A86");
    expect(lightPrimary.dark).toBe("#0E5A66");
    expect(lightPrimary.light).toBe("#8AC8D0");
    expect(lightPrimary.contrastText).toBe("#ffffff");
    expect(theme.colorSchemes.light.palette.background.default).toBe("#f8fafc");
    expect(theme.colorSchemes.light.palette.background.paper).toBe("#ffffff");
  });

  it("dark scheme uses dark backgrounds and light text", () => {
    const dark = theme.colorSchemes.dark.palette;
    expect(dark.background.default).toBe("#0F172A");
    expect(dark.background.paper).toBe("#1E293B");
    expect(dark.text.primary).toBe("#F1F5F9");
  });
});

describe("theme — WCAG AA contrast", () => {
  // Pairs must pass 4.5:1 for normal body text (WCAG 2.1 AA). The
  // comprehensive audit (every text-bearing pair, both schemes) lives in the
  // follow-up issue #289; this suite covers the foundational text-on-bg pairs
  // both schemes must hit before either is acceptable to ship.
  const lightPalette = theme.colorSchemes.light.palette;
  const darkPalette = theme.colorSchemes.dark.palette;

  const pairs = [
    {
      name: "[light] text.primary on background.default",
      fg: () => lightPalette.text.primary,
      bg: () => lightPalette.background.default,
    },
    {
      name: "[light] text.primary on background.paper",
      fg: () => lightPalette.text.primary,
      bg: () => lightPalette.background.paper,
    },
    {
      name: "[light] text.secondary on background.default",
      fg: () => lightPalette.text.secondary,
      bg: () => lightPalette.background.default,
    },
    {
      name: "[light] header.contrastText on header.main",
      fg: () => lightPalette.header.contrastText,
      bg: () => lightPalette.header.main,
    },
    {
      name: "[dark] text.primary on background.default",
      fg: () => darkPalette.text.primary,
      bg: () => darkPalette.background.default,
    },
    {
      name: "[dark] text.primary on background.paper",
      fg: () => darkPalette.text.primary,
      bg: () => darkPalette.background.paper,
    },
    {
      name: "[dark] text.secondary on background.default",
      fg: () => darkPalette.text.secondary,
      bg: () => darkPalette.background.default,
    },
    {
      name: "[dark] header.contrastText on header.main",
      fg: () => darkPalette.header.contrastText,
      bg: () => darkPalette.header.main,
    },
  ];

  it.each(pairs)("$name meets 4.5:1", ({ fg, bg }) => {
    const ratio = contrastRatio(fg(), bg());
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
