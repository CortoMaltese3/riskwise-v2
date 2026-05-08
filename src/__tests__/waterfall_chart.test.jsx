import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
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

vi.mock("chartjs-plugin-datalabels", () => ({ default: {} }));

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

let WaterfallChart;
let useStore;

beforeAll(async () => {
  ({ default: WaterfallChart } = await import("../components/charts/WaterfallChart"));
  ({ default: useStore } = await import("../store/useUIStore"));
});

beforeEach(() => {
  barSpy.mockClear();
  globalThis.localStorage?.removeItem("riskwise.showChartValues");
  useStore.setState({ showChartValues: false });
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

  it("exposes a Show values toggle that gates datalabels display", () => {
    render(<WaterfallChart data={FIXTURE} />);
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
