import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("chartjs-plugin-datalabels", () => ({ default: {} }));

const FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Seawall", cost: 1000000, benefit: 2500000, benefit_cost_ratio: 2.5 },
    { name: "Mangroves", cost: 400000, benefit: 320000, benefit_cost_ratio: 0.8 },
  ],
};

let CostBenefitChart;
let useStore;

beforeAll(async () => {
  ({ default: CostBenefitChart } = await import("../components/charts/CostBenefitChart"));
  ({ default: useStore } = await import("../store"));
});

beforeEach(() => {
  barSpy.mockClear();
  globalThis.localStorage?.removeItem("riskwise.showChartValues");
  useStore.setState({ showChartValues: false });
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

  it("exposes a Show values toggle that gates datalabels display", () => {
    render(<CostBenefitChart data={FIXTURE} />);
    const initial = barSpy.mock.calls.at(-1)[0];
    expect(initial.options.plugins.datalabels.display).toBe(false);
    const toggle = screen.getByRole("button", { name: /chart_show_values/i });
    act(() => {
      fireEvent.click(toggle);
    });
    const afterToggle = barSpy.mock.calls.at(-1)[0];
    expect(afterToggle.options.plugins.datalabels.display).toBe(true);
  });
});
