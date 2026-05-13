import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme/theme";

// Charts read viz palette tokens via useTheme() (#298), so every render must
// be wrapped in our ThemeProvider — the default MUI theme has no `viz` slot.
const render = (ui, options) =>
  rtlRender(<ThemeProvider theme={theme}>{ui}</ThemeProvider>, options);
import axe from "axe-core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const barSpy = vi.fn();

// Stub Chart.js' canvas-bound renderer: jsdom has no canvas, and the unit
// under test is the data-shape transformation we hand to Chart.js, not the
// pixel output.
vi.mock("react-chartjs-2", () => ({
  Bar: (props) => {
    barSpy(props);
    return <div data-testid="waterfall-bar" />;
  },
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  BarElement: {},
  CategoryScale: {},
  LinearScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

// Spy on `patternForIndex` so we can assert the theme stroke is wired
// through from `theme.palette.viz.patternStroke`. We still let the real
// implementation run (it returns the colour string in jsdom, which is the
// safe fallback path).
const patternForIndexSpy = vi.fn();
vi.mock("../utils/chartPatterns", async () => {
  const actual = await vi.importActual("../utils/chartPatterns");
  return {
    ...actual,
    patternForIndex: (...args) => {
      patternForIndexSpy(...args);
      return actual.patternForIndex(...args);
    },
  };
});

const FIXTURE = {
  present_year: 2024,
  future_year: 2050,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Risk 2024", value: 100, base: 0 },
    {
      key: "economic_development",
      label: "Economic development",
      value: 25,
      base: 100,
    },
    { key: "climate_change", label: "Climate change", value: 50, base: 125 },
    { key: "risk_future", label: "Risk 2050", value: 175, base: 0 },
  ],
};

// Dataset where the smallest non-zero bar (25) is more than 10x smaller than
// the largest (2,750,000). Used to exercise the value-label plugin (#412 A2)
// and the linear-tick budget (#412 A5).
const WIDE_RANGE_FIXTURE = {
  present_year: 2024,
  future_year: 2050,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Risk 2024", value: 31477, base: 0 },
    {
      key: "economic_development",
      label: "Economic development",
      value: 25000,
      base: 31477,
    },
    {
      key: "climate_change",
      label: "Climate change",
      value: 2693523,
      base: 56477,
    },
    { key: "risk_future", label: "Risk 2050", value: 2750000, base: 0 },
  ],
};

// Dataset with at least one increase AND one decrease — used to verify the
// legend renders all three swatches when the dataset spans every category
// (#412 A4).
const ALL_CATEGORIES_FIXTURE = {
  present_year: 2024,
  future_year: 2050,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Risk 2024", value: 100, base: 0 },
    {
      key: "economic_development",
      label: "Economic development",
      value: 30,
      base: 100,
    },
    { key: "climate_change", label: "Climate change", value: -10, base: 130 },
    { key: "risk_future", label: "Risk 2050", value: 120, base: 0 },
  ],
};

// Dataset with only totals + an increase — used to verify the legend hides
// the "decrease" swatch when no bar in the dataset matches that semantic
// (#412 A4).
const NO_DECREASE_FIXTURE = {
  present_year: 2024,
  future_year: 2050,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Risk 2024", value: 100, base: 0 },
    {
      key: "climate_change",
      label: "Climate change",
      value: 50,
      base: 100,
    },
    { key: "risk_future", label: "Risk 2050", value: 150, base: 0 },
  ],
};

let WaterfallChart;

beforeAll(async () => {
  ({ default: WaterfallChart } = await import("../components/charts/WaterfallChart"));
});

beforeEach(() => {
  barSpy.mockClear();
  patternForIndexSpy.mockClear();
});

describe("WaterfallChart", () => {
  it("renders four floating bars from a typed payload", () => {
    render(<WaterfallChart data={FIXTURE} />);
    expect(screen.getByTestId("waterfall-bar")).toBeInTheDocument();

    const props = barSpy.mock.calls[0][0];
    expect(props.data.labels).toEqual([
      "Risk 2024",
      "Economic development",
      "Climate change",
      "Risk 2050",
    ]);
    expect(props.data.datasets[0].data).toEqual([
      [0, 100],
      [100, 125],
      [125, 175],
      [0, 175],
    ]);
  });

  it("renders a hover tooltip with category value + units", () => {
    render(<WaterfallChart data={FIXTURE} />);

    const props = barSpy.mock.calls[0][0];
    const tooltipLabel = props.options.plugins.tooltip.callbacks.label({
      dataIndex: 1,
    });
    expect(tooltipLabel).toContain("25");
    expect(tooltipLabel).toContain("USD");

    const tooltipTitle = props.options.plugins.tooltip.callbacks.title([
      { label: "Economic development" },
    ]);
    expect(tooltipTitle).toBe("Economic development");
  });

  it("falls back to a localized message when data is missing", () => {
    render(<WaterfallChart data={null} />);
    expect(
      screen.getByText("economic_non_economic_risk_display_chart_loading_error")
    ).toBeInTheDocument();
  });

  it("falls back to provided error message when categories is empty", () => {
    render(<WaterfallChart data={{ ...FIXTURE, categories: [] }} errorMessage="custom error" />);
    expect(screen.getByText("custom error")).toBeInTheDocument();
  });

  it("colors the totals differently from the deltas", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const colors = props.data.datasets[0].borderColor;
    expect(colors[0]).toBe(colors[3]); // both totals share the same color
    expect(colors[0]).not.toBe(colors[1]); // total vs. delta differ
  });

  it("marks the canvas with role=img and a descriptive aria-label", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.role).toBe("img");
    expect(typeof props["aria-label"]).toBe("string");
    expect(props["aria-label"]).toContain("2024");
    expect(props["aria-label"]).toContain("2050");
  });

  it("renders a screen-reader-accessible data table fallback", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    FIXTURE.categories.forEach((c) => {
      expect(screen.getByText(c.label)).toBeInTheDocument();
    });
  });

  it("has no critical or serious axe violations", async () => {
    const { container } = render(<WaterfallChart data={FIXTURE} />);
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    expect(critical).toHaveLength(0);
    expect(serious).toHaveLength(0);
  });

  it("threads theme.palette.viz.patternStroke into patternForIndex (#367)", () => {
    // Default scheme is light → stroke must be the dark translucent overlay.
    render(<WaterfallChart data={FIXTURE} />);
    expect(patternForIndexSpy).toHaveBeenCalled();
    const calls = patternForIndexSpy.mock.calls;
    // Every call is `(color, patternIndex, stroke)` — the third arg is the
    // theme-supplied stroke and must match the light-scheme token.
    const expectedStroke = theme.colorSchemes.light.palette.viz.patternStroke;
    for (const call of calls) {
      expect(call[2]).toBe(expectedStroke);
    }
  });

  it("does not render a show/hide values toggle", () => {
    render(<WaterfallChart data={FIXTURE} />);
    expect(
      screen.queryByRole("button", { name: /show values|hide values/i })
    ).not.toBeInTheDocument();
  });

  it("registers a connector-lines plugin so the waterfall reads as steps (#412 A1)", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const connector = props.plugins.find((p) => p.id === "waterfall-connectors");
    expect(connector).toBeDefined();
    expect(typeof connector.afterDatasetsDraw).toBe("function");
    // The plugin renders n-1 connector segments; with 4 bars in this fixture
    // it iterates 3 times. We invoke it against a stubbed canvas to confirm.
    const moveTo = vi.fn();
    const lineTo = vi.fn();
    const stroke = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      setLineDash: vi.fn(),
      moveTo,
      lineTo,
      stroke,
    };
    const yScale = { getPixelForValue: (v) => v };
    const meta = {
      data: [
        { x: 0, width: 10 },
        { x: 30, width: 10 },
        { x: 60, width: 10 },
        { x: 90, width: 10 },
      ],
    };
    connector.afterDatasetsDraw({ ctx, scales: { y: yScale }, getDatasetMeta: () => meta });
    expect(stroke).toHaveBeenCalledTimes(3);
  });

  it("does not run the value-label plugin when bars are similarly sized (#412 A2)", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.plugins.find((p) => p.id === "waterfall-value-labels")).toBeUndefined();
  });

  it("labels every bar with its formatted value when the magnitude ratio is wide (#412 A2)", () => {
    render(<WaterfallChart data={WIDE_RANGE_FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const valueLabels = props.plugins.find((p) => p.id === "waterfall-value-labels");
    expect(valueLabels).toBeDefined();
    const fillText = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillText,
      font: "",
      fillStyle: "",
      textAlign: "",
      textBaseline: "",
    };
    const meta = {
      data: [
        { x: 0, y: 100, base: 200 },
        { x: 30, y: 100, base: 200 },
        { x: 60, y: 100, base: 200 },
        { x: 90, y: 100, base: 200 },
      ],
    };
    valueLabels.afterDatasetsDraw({ ctx, getDatasetMeta: () => meta });
    expect(fillText).toHaveBeenCalledTimes(WIDE_RANGE_FIXTURE.categories.length);
  });

  it("renders three legend swatches for total + increase + decrease (#412 A4)", () => {
    render(<WaterfallChart data={ALL_CATEGORIES_FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.options.plugins.legend.display).toBe(true);
    const labels = props.options.plugins.legend.labels.generateLabels();
    expect(labels).toHaveLength(3);
    const texts = labels.map((l) => l.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "chart_legend_total",
        "chart_legend_increases_risk",
        "chart_legend_reduces_risk",
      ])
    );
  });

  it("omits legend swatches that do not match any bar in the dataset (#412 A4)", () => {
    render(<WaterfallChart data={NO_DECREASE_FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const labels = props.options.plugins.legend.labels.generateLabels();
    expect(labels.map((l) => l.text)).toEqual([
      "chart_legend_total",
      "chart_legend_increases_risk",
    ]);
  });

  it("constrains the Y-axis to between 5 and 8 evenly spaced ticks (#412 A5)", () => {
    render(<WaterfallChart data={WIDE_RANGE_FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const axis = { min: 0, max: 2_750_000, ticks: [] };
    props.options.scales.y.afterBuildTicks(axis);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(5);
    expect(axis.ticks.length).toBeLessThanOrEqual(8);
  });

  it("appends the unit to the H3 title and hides the rotated y-axis title (#412 A6)", () => {
    render(<WaterfallChart data={FIXTURE} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toMatch(/\(USD\)/);
    const props = barSpy.mock.calls[0][0];
    expect(props.options.scales.y.title.display).toBe(false);
  });

  it("leaves the Risk-2024 baseline bar solid while hatching future-derived bars (#412 C1)", () => {
    render(<WaterfallChart data={FIXTURE} />);
    // patternForIndex is invoked once per *future* bar (3 bars in this
    // fixture). The Risk-2024 baseline stays solid → no call for it.
    expect(patternForIndexSpy.mock.calls).toHaveLength(3);
    const props = barSpy.mock.calls[0][0];
    // In jsdom canvas pattern creation falls back to a string, so we can't
    // tell apart "solid" and "patterned" from the value alone; what we can
    // assert is that Risk-2024's backgroundColor equals its borderColor
    // exactly (i.e. the same string instance we passed in for the solid case).
    const bg = props.data.datasets[0].backgroundColor;
    const border = props.data.datasets[0].borderColor;
    expect(bg[0]).toBe(border[0]);
  });

  it("does not render a trailing aria-hidden spacer below the chart (#412 C2)", () => {
    const { container } = render(<WaterfallChart data={FIXTURE} />);
    // The old layout placed a `<Box flex={1} aria-hidden />` after the table
    // to push the chart up; that spacer is gone. Any remaining aria-hidden
    // nodes must carry content (icons etc.).
    const ariaHiddenEmptyDivs = Array.from(
      container.querySelectorAll('[aria-hidden="true"]')
    ).filter((el) => el.tagName === "DIV" && el.children.length === 0 && !el.textContent.trim());
    expect(ariaHiddenEmptyDivs).toHaveLength(0);
  });
});
