import { describe, it, expect } from "vitest";
import theme, { MOTION_DURATION_MS, MOTION_EASING, layoutTransition } from "./theme";

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

describe("theme — WCAG AA contrast", () => {
  // Pairs must pass 4.5:1 for normal body text (WCAG 2.1 AA). Extend this list
  // as new semantic pairs are added; each pair documents a real on-screen use.
  const pairs = [
    {
      name: "text.primary on background.default",
      fg: () => theme.palette.text.primary,
      bg: () => theme.palette.background.default,
    },
    {
      name: "text.primary on background.paper",
      fg: () => theme.palette.text.primary,
      bg: () => theme.palette.background.paper,
    },
    {
      name: "text.secondary on background.default",
      fg: () => theme.palette.text.secondary,
      bg: () => theme.palette.background.default,
    },
    {
      name: "header.contrastText on header.main",
      fg: () => theme.palette.header.contrastText,
      bg: () => theme.palette.header.main,
    },
  ];

  it.each(pairs)("$name meets 4.5:1", ({ fg, bg }) => {
    const ratio = contrastRatio(fg(), bg());
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
