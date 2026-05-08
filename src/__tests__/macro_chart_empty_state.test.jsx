import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme/theme";

// Charts read viz palette tokens via useTheme() (#298), so every render must
// be wrapped in our ThemeProvider — the default MUI theme has no `viz` slot.
const render = (ui, options) =>
  rtlRender(<ThemeProvider theme={theme}>{ui}</ThemeProvider>, options);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const lineSpy = vi.fn();

// Stub Chart.js' canvas-bound renderer: jsdom has no canvas, and the unit
// under test is the data-shape we hand to Chart.js — specifically that axes
// and an empty series shape are still emitted in the empty state.
vi.mock("react-chartjs-2", () => ({
  Line: (props) => {
    lineSpy(props);
    return <div data-testid="macro-line" />;
  },
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  LineElement: {},
  PointElement: {},
  CategoryScale: {},
  LinearScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
  Filler: {},
}));

vi.mock("chartjs-plugin-datalabels", () => ({ default: {} }));

let MacroEconomicChart;
let useUIStore;
let useResultsStore;
let useWorkspaceStore;

const SAMPLE_ROWS = [
  {
    country: "ESP",
    scenario: "rcp45",
    economic_sector: "agriculture",
    economic_indicator: "gdp",
    adpatation: 0,
    year: 2030,
    proportion_change_from_baseline: -0.05,
  },
  {
    country: "ESP",
    scenario: "rcp45",
    economic_sector: "agriculture",
    economic_indicator: "gdp",
    adpatation: 0,
    year: 2040,
    proportion_change_from_baseline: -0.08,
  },
  {
    country: "ESP",
    scenario: "rcp45",
    economic_sector: "agriculture",
    economic_indicator: "gdp",
    adpatation: 0.5,
    year: 2030,
    proportion_change_from_baseline: -0.02,
  },
  {
    country: "ESP",
    scenario: "rcp45",
    economic_sector: "agriculture",
    economic_indicator: "gdp",
    adpatation: 0.5,
    year: 2040,
    proportion_change_from_baseline: -0.03,
  },
];

beforeAll(async () => {
  ({ default: MacroEconomicChart } = await import("../components/charts/MacroEconomicChart"));
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
});

beforeEach(() => {
  lineSpy.mockClear();
  useResultsStore.setState({
    credOutputData: [],
    macroEconomicChartTitle: "",
  });
  useWorkspaceStore.setState({
    selectedMacroCountry: "",
    selectedMacroScenario: "",
    selectedMacroSector: "",
    selectedMacroVariable: "",
  });
  useUIStore.setState({ showChartValues: false });
});

describe("MacroEconomicChart empty + progressive states", () => {
  it("renders a framed Line chart with axis labels and empty datasets when no data is loaded", () => {
    render(<MacroEconomicChart />);

    expect(screen.getByTestId("macro-chart-frame")).toBeInTheDocument();
    expect(screen.getByTestId("macro-line")).toBeInTheDocument();
    expect(screen.getByTestId("macro-chart-empty-hint")).toHaveTextContent(
      "macro_display_chart_not_available"
    );

    const props = lineSpy.mock.calls.at(-1)[0];
    expect(props.data.datasets).toEqual([]);
    expect(props.data.labels).toEqual([]);
    expect(props.options.scales.x.title.text).toBe("macro_display_chart_x_axis_label");
    expect(props.options.scales.y.title.text).toBe("macro_display_chart_y_axis_label");
    expect(props.options.plugins.legend.display).toBe(true);
  });

  it("does not render the title bar or values toggle in the empty state", () => {
    render(<MacroEconomicChart />);

    expect(screen.queryByRole("button", { name: /chart_show_values/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the empty frame when only some parameters are selected (slice unresolved)", () => {
    useResultsStore.setState({ credOutputData: SAMPLE_ROWS });
    useWorkspaceStore.setState({
      selectedMacroCountry: "ESP",
      selectedMacroScenario: "rcp45",
      // sector + variable still unset → no row matches the filter
    });

    render(<MacroEconomicChart />);

    expect(screen.getByTestId("macro-chart-empty-hint")).toBeInTheDocument();
    const props = lineSpy.mock.calls.at(-1)[0];
    expect(props.data.datasets).toEqual([]);
  });

  it("populates the chart progressively once all four parameters resolve a non-empty slice", () => {
    useResultsStore.setState({
      credOutputData: SAMPLE_ROWS,
      macroEconomicChartTitle: "ESP · agriculture · gdp",
    });
    useWorkspaceStore.setState({
      selectedMacroCountry: "ESP",
      selectedMacroScenario: "rcp45",
      selectedMacroSector: "agriculture",
      selectedMacroVariable: "gdp",
    });

    render(<MacroEconomicChart />);

    expect(screen.queryByTestId("macro-chart-empty-hint")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chart_show_values/i })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();

    const props = lineSpy.mock.calls.at(-1)[0];
    expect(props.data.labels).toEqual([2030, 2040]);
    // Two adaptation tiers in the slice → two series.
    expect(props.data.datasets).toHaveLength(2);
    // Values are converted from proportion to percent.
    const noAdaptationSeries = props.data.datasets.find(
      (d) => d.label === "macro_display_chart_no_adaptation"
    );
    expect(noAdaptationSeries.data).toEqual([-5, -8]);
  });
});
