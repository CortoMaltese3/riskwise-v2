import { describe, it, expect } from "vitest";
import theme from "../theme/theme";
import { buildChartThemeOptions } from "./chartTheme";

// Chart.js renders axis labels, ticks, gridlines, and tooltips with hardcoded
// greys by default. The helper under test resolves those to MUI palette
// tokens so charts track the active scheme (#289). This suite is the
// "chart receives dark-scheme colors" check the issue calls for — proven
// once at the helper boundary so the three Chart.js components that consume
// it stay verified without three near-identical render tests.

const lightThemed = (palette) => ({ palette });

const synthesisedTheme = (scheme) =>
  lightThemed({
    ...theme.colorSchemes[scheme].palette,
    // `theme.colorSchemes.<x>.palette` has the raw values from theme.ts;
    // MUI's runtime adds `divider`, `action.*`, etc. on top of the configured
    // slots. Re-add the minimum the helper reads here.
    divider: scheme === "dark" ? "#334155" : "rgba(0, 0, 0, 0.12)",
  });

describe("buildChartThemeOptions", () => {
  it("returns light-scheme text and tooltip colours under the light scheme", () => {
    const options = buildChartThemeOptions(synthesisedTheme("light"));
    expect(options.scales.x.title.color).toBe("#0F172A");
    expect(options.scales.y.title.color).toBe("#0F172A");
    expect(options.plugins.legend.labels.color).toBe("#0F172A");
    expect(options.plugins.tooltip.backgroundColor).toBe("#FFFFFF");
    expect(options.plugins.tooltip.titleColor).toBe("#0F172A");
    expect(options.plugins.tooltip.bodyColor).toBe("#0F172A");
  });

  it("returns dark-scheme text and tooltip colours under the dark scheme", () => {
    const options = buildChartThemeOptions(synthesisedTheme("dark"));
    expect(options.scales.x.title.color).toBe("#F1F5F9");
    expect(options.scales.y.title.color).toBe("#F1F5F9");
    expect(options.plugins.legend.labels.color).toBe("#F1F5F9");
    expect(options.plugins.tooltip.backgroundColor).toBe("#1E293B");
    expect(options.plugins.tooltip.titleColor).toBe("#F1F5F9");
    expect(options.plugins.tooltip.bodyColor).toBe("#F1F5F9");
  });

  it("produces strictly different axis text colours between schemes", () => {
    // Regression guard: a future change that swaps text.primary to the same
    // hex in both schemes would silently break dark mode for chart axes —
    // assert the two scheme outputs disagree where they must.
    const light = buildChartThemeOptions(synthesisedTheme("light"));
    const dark = buildChartThemeOptions(synthesisedTheme("dark"));
    expect(light.scales.y.title.color).not.toBe(dark.scales.y.title.color);
    expect(light.plugins.tooltip.backgroundColor).not.toBe(dark.plugins.tooltip.backgroundColor);
  });
});
