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
    return <div data-testid="cost-benefit-bar" />;
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

const FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Seawall", cost: 1000000, benefit: 2500000, benefit_cost_ratio: 2.5 },
    { name: "Mangroves", cost: 400000, benefit: 320000, benefit_cost_ratio: 0.8 },
  ],
};

// Fixture with long spelt-out measure names (#412 B1).
const LONG_NAMES_FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Recharging wells", cost: 100, benefit: 130, benefit_cost_ratio: 1.3 },
    { name: "Soil and water bunds", cost: 100, benefit: 120, benefit_cost_ratio: 1.2 },
  ],
};

// Fixture with a low-headroom max ratio (1.30) — used to verify the
// suggestedMax floor of 1.5 (#412 B5).
const LOW_HEADROOM_FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Measure A", cost: 100, benefit: 130, benefit_cost_ratio: 1.3 },
    { name: "Measure B", cost: 100, benefit: 100, benefit_cost_ratio: 1.0 },
  ],
};

// Fixture with a tall max ratio (2.0) — used to verify the +0.2 headroom
// (#412 B5).
const TALL_FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Measure A", cost: 100, benefit: 200, benefit_cost_ratio: 2.0 },
    { name: "Measure B", cost: 100, benefit: 100, benefit_cost_ratio: 1.0 },
  ],
};

let CostBenefitChart;

beforeAll(async () => {
  ({ default: CostBenefitChart } = await import("../components/charts/CostBenefitChart"));
});

beforeEach(() => {
  barSpy.mockClear();
});

describe("CostBenefitChart", () => {
  it("renders one bar per measure with the benefit/cost ratio as the value", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    expect(screen.getByTestId("cost-benefit-bar")).toBeInTheDocument();

    const props = barSpy.mock.calls[0][0];
    expect(props.data.labels).toEqual(["Seawall", "Mangroves"]);
    expect(props.data.datasets[0].data).toEqual([2.5, 0.8]);
  });

  it("renders a tooltip with measure name, cost, benefit, and ratio", () => {
    render(<CostBenefitChart data={FIXTURE} />);

    const props = barSpy.mock.calls[0][0];
    const tooltipLines = props.options.plugins.tooltip.callbacks.label({ dataIndex: 0 });
    expect(tooltipLines).toHaveLength(3);
    const joined = tooltipLines.join(" | ");
    // Locale-agnostic digit checks: thousand/decimal separators vary with JIT locale.
    expect(joined.replace(/[^0-9]/g, "")).toContain("1000000");
    expect(joined.replace(/[^0-9]/g, "")).toContain("2500000");
    expect(joined).toContain("USD");
    expect(joined).toMatch(/cost/i);
    expect(joined).toMatch(/benefit/i);

    const tooltipTitle = props.options.plugins.tooltip.callbacks.title([{ label: "Seawall" }]);
    expect(tooltipTitle).toBe("Seawall");
  });

  it("falls back to a localized message when data is missing", () => {
    render(<CostBenefitChart data={null} />);
    expect(
      screen.getByText("economic_non_economic_adaptation_display_chart_loading_error")
    ).toBeInTheDocument();
  });

  it("falls back to provided error message when measures is empty", () => {
    render(<CostBenefitChart data={{ ...FIXTURE, measures: [] }} errorMessage="custom error" />);
    expect(screen.getByText("custom error")).toBeInTheDocument();
  });

  it("colors profitable measures (ratio >= 1) differently from unprofitable ones", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const colors = props.data.datasets[0].borderColor;
    expect(colors[0]).not.toBe(colors[1]);
  });

  it("marks the canvas with role=img and a descriptive aria-label", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.role).toBe("img");
    expect(props["aria-label"]).toContain("Seawall");
    expect(props["aria-label"]).toMatch(/2[.,]5/);
  });

  it("renders a screen-reader-accessible data table fallback", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByText("Seawall")).toBeInTheDocument();
    expect(screen.getByText("Mangroves")).toBeInTheDocument();
  });

  it("has no critical or serious axe violations", async () => {
    const { container } = render(<CostBenefitChart data={FIXTURE} />);
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    expect(critical).toHaveLength(0);
    expect(serious).toHaveLength(0);
  });

  it("does not render a show/hide values toggle", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    expect(
      screen.queryByRole("button", { name: /show values|hide values/i })
    ).not.toBeInTheDocument();
  });

  it("rotates x-axis tick labels up to 45° and keeps Chart.js auto-skip on (#412 B1)", () => {
    render(<CostBenefitChart data={LONG_NAMES_FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.options.scales.x.ticks.maxRotation).toBe(45);
    expect(props.options.scales.x.ticks.autoSkip).toBe(true);
    expect(props.data.labels).toEqual(["Recharging wells", "Soil and water bunds"]);
  });

  it("renders display_name through i18n when present, falling back to name otherwise (#429)", () => {
    const FIXTURE_429 = {
      currency_unit: "USD",
      present_year: 2024,
      future_year: 2050,
      // ERA codes from #429 inventory: at least one of GR / TP / GBC plus a
      // no-mapping fallback row to exercise both branches of ``labelFor``.
      measures: [
        {
          name: "GR",
          display_name: "adaptation_measures_green_roofs",
          cost: 100,
          benefit: 200,
          benefit_cost_ratio: 2.0,
        },
        {
          name: "TP",
          display_name: "adaptation_measures_trees_planting",
          cost: 100,
          benefit: 150,
          benefit_cost_ratio: 1.5,
        },
        {
          name: "GBC",
          display_name: "adaptation_measures_green_building_codes",
          cost: 100,
          benefit: 80,
          benefit_cost_ratio: 0.8,
        },
        { name: "WSP", cost: 100, benefit: 100, benefit_cost_ratio: 1.0 },
      ],
    };
    render(<CostBenefitChart data={FIXTURE_429} />);
    const props = barSpy.mock.calls[0][0];
    // The mocked t() in this file echoes the key; that's exactly what we
    // need to assert that the chart routes display_name through i18n
    // (a real bundle would map the key to "Green Roofs", "Trees planting",
    // "Green building codes").
    expect(props.data.labels).toEqual([
      "adaptation_measures_green_roofs",
      "adaptation_measures_trees_planting",
      "adaptation_measures_green_building_codes",
      "WSP",
    ]);
    expect(props["aria-label"]).toContain("adaptation_measures_green_roofs");
    expect(props["aria-label"]).toContain("WSP");
  });

  it("registers a break-even plugin that draws a dashed line at y=1 (#412 B2)", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const plugin = props.plugins.find((p) => p.id === "cost-benefit-break-even");
    expect(plugin).toBeDefined();
    expect(typeof plugin.afterDatasetsDraw).toBe("function");
    // Smoke-test the draw path against a stubbed canvas.
    const fillText = vi.fn();
    const stroke = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      setLineDash: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke,
      fillText,
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      textAlign: "",
      textBaseline: "",
    };
    plugin.afterDatasetsDraw({
      ctx,
      scales: {
        y: { getPixelForValue: (v) => (v === 1 ? 100 : 0) },
        x: { left: 0, right: 400 },
      },
    });
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(fillText).toHaveBeenCalledWith(
      "chart_break_even_label",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("anchors the tooltip above its bar instead of tracking the cursor (#412 B4)", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    expect(props.options.plugins.tooltip.position).toBe("average");
  });

  it("reserves at least 0.2 of y-axis headroom above the tallest bar (#412 B5)", () => {
    render(<CostBenefitChart data={LOW_HEADROOM_FIXTURE} />);
    let props = barSpy.mock.calls[0][0];
    expect(props.options.scales.y.suggestedMax).toBeGreaterThanOrEqual(1.5);

    barSpy.mockClear();
    render(<CostBenefitChart data={TALL_FIXTURE} />);
    props = barSpy.mock.calls[0][0];
    expect(props.options.scales.y.suggestedMax).toBeGreaterThanOrEqual(2.2);
  });

  it("renders bars as solid colors with no canvas-pattern fill (#412 C1)", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const props = barSpy.mock.calls[0][0];
    const bgs = props.data.datasets[0].backgroundColor;
    bgs.forEach((bg) => {
      expect(typeof bg).toBe("string");
    });
  });

  it("does not render a trailing aria-hidden spacer below the chart (#412 C2)", () => {
    const { container } = render(<CostBenefitChart data={FIXTURE} />);
    const ariaHiddenEmptyDivs = Array.from(
      container.querySelectorAll('[aria-hidden="true"]')
    ).filter((el) => el.tagName === "DIV" && el.children.length === 0 && !el.textContent.trim());
    expect(ariaHiddenEmptyDivs).toHaveLength(0);
  });
});
