import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
    const colors = props.data.datasets[0].backgroundColor;
    expect(colors[0]).not.toBe(colors[1]);
  });
});
