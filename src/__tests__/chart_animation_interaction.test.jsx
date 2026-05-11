/**
 * Animation + interaction polish (#370).
 *
 * Covers the cross-chart behaviour introduced together so we have one place
 * to change when the policy shifts:
 *   - `interaction.mode === "index"` and `interaction.intersect === false`
 *     on all three charts (forgiving hover / tooltip targets).
 *   - `animation` is an `{ duration, easing }` object on first render and
 *     `false` after the first effect runs (mount-only intro).
 *   - `prefers-reduced-motion: reduce` collapses `animation` to `false`.
 *   - `MacroEconomicChart` datasets carry the new point-radius trio.
 *
 * The chart components are mocked at `react-chartjs-2` (jsdom has no canvas).
 * We spy on the props the chart wrappers receive and assert against them.
 */

import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render as rtlRender } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme/theme";

const render = (ui, options) =>
  rtlRender(<ThemeProvider theme={theme}>{ui}</ThemeProvider>, options);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Shared spies — cleared per test. Each mocked chart component captures the
// instance assigned to its `ref` so we can simulate the post-mount effect
// flipping `options.animation` to false.
const barSpy = vi.fn();
const lineSpy = vi.fn();

function makeFakeChartInstance(initialOptions) {
  // Mirrors the relevant slice of Chart.js's instance surface. The chart
  // component's post-mount `useEffect` only assigns to `options.animation`,
  // so we only need that field to be writable.
  return { options: { ...initialOptions } };
}

// `vi.mock` is hoisted to the top of the file, so the factory closes over the
// module-level `barSpy` / `lineSpy` / `makeFakeChartInstance` symbols at call
// time. Using named function components keeps `react/display-name` happy.
vi.mock("react-chartjs-2", () => {
  const Bar = React.forwardRef(function Bar(props, ref) {
    barSpy(props);
    if (ref) {
      const instance = makeFakeChartInstance(props.options);
      if (typeof ref === "function") ref(instance);
      else ref.current = instance;
    }
    return <div data-testid="bar-chart" />;
  });
  const Line = React.forwardRef(function Line(props, ref) {
    lineSpy(props);
    if (ref) {
      const instance = makeFakeChartInstance(props.options);
      if (typeof ref === "function") ref(instance);
      else ref.current = instance;
    }
    return <div data-testid="line-chart" />;
  });
  return { Bar, Line };
});

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  BarElement: {},
  CategoryScale: {},
  LinearScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
  LineElement: {},
  PointElement: {},
  Filler: {},
}));

vi.mock("chartjs-plugin-datalabels", () => ({ default: {} }));

let WaterfallChart;
let CostBenefitChart;
let MacroEconomicChart;
let useUIStore;
let useResultsStore;
let useWorkspaceStore;

const WATERFALL_FIXTURE = {
  present_year: 2024,
  future_year: 2050,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Risk 2024", value: 100, base: 0 },
    { key: "climate_change", label: "Climate change", value: 50, base: 100 },
    { key: "risk_future", label: "Risk 2050", value: 150, base: 0 },
  ],
};

const COSTBENEFIT_FIXTURE = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [{ name: "Seawall", cost: 1_000_000, benefit: 2_500_000, benefit_cost_ratio: 2.5 }],
};

const MACRO_ROWS = [
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
];

beforeAll(async () => {
  ({ default: WaterfallChart } = await import("../components/charts/WaterfallChart"));
  ({ default: CostBenefitChart } = await import("../components/charts/CostBenefitChart"));
  ({ default: MacroEconomicChart } = await import("../components/charts/MacroEconomicChart"));
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
});

// `matchMedia` is not in jsdom. We install a configurable stub per test so
// individual cases can toggle the reduced-motion preference.
function installMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  barSpy.mockClear();
  lineSpy.mockClear();
  installMatchMedia(false);
  useUIStore.setState({ showChartValues: false });
  useResultsStore.setState({
    credOutputData: MACRO_ROWS,
    macroEconomicChartTitle: "ESP · agriculture · gdp",
  });
  useWorkspaceStore.setState({
    selectedMacroCountry: "ESP",
    selectedMacroScenario: "rcp45",
    selectedMacroSector: "agriculture",
    selectedMacroVariable: "gdp",
  });
});

afterEach(() => {
  delete window.matchMedia;
});

describe("Chart animation + interaction polish (#370)", () => {
  describe("interaction mode is forgiving across all three charts", () => {
    it("waterfall uses index mode with intersect: false", () => {
      render(<WaterfallChart data={WATERFALL_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.interaction).toEqual({ mode: "index", intersect: false });
    });

    it("cost-benefit uses index mode with intersect: false", () => {
      render(<CostBenefitChart data={COSTBENEFIT_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.interaction).toEqual({ mode: "index", intersect: false });
    });

    it("macro line uses index mode with intersect: false", () => {
      render(<MacroEconomicChart />);
      const props = lineSpy.mock.calls.at(-1)[0];
      expect(props.options.interaction).toEqual({ mode: "index", intersect: false });
    });
  });

  describe("animation is mount-only and reduced-motion-aware", () => {
    it("waterfall renders the intro animation config when reduced-motion is off", () => {
      render(<WaterfallChart data={WATERFALL_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toEqual({ duration: 600, easing: "easeOutQuart" });
    });

    it("cost-benefit renders the intro animation config when reduced-motion is off", () => {
      render(<CostBenefitChart data={COSTBENEFIT_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toEqual({ duration: 600, easing: "easeOutQuart" });
    });

    it("macro renders the intro animation config when reduced-motion is off", () => {
      render(<MacroEconomicChart />);
      const props = lineSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toEqual({ duration: 600, easing: "easeOutQuart" });
    });

    it("waterfall disables further animation on the chart instance after mount", () => {
      // The mocked Bar exposes the chart instance via ref; the component's
      // post-mount effect flips its `options.animation` to false. We have to
      // reach the instance via the forwarded ref to assert on the side-effect.
      const ref = React.createRef();
      render(<WaterfallChart ref={ref} data={WATERFALL_FIXTURE} />);
      expect(ref.current).toBeTruthy();
      expect(ref.current.options.animation).toBe(false);
    });

    it("cost-benefit disables further animation on the chart instance after mount", () => {
      const ref = React.createRef();
      render(<CostBenefitChart ref={ref} data={COSTBENEFIT_FIXTURE} />);
      expect(ref.current).toBeTruthy();
      expect(ref.current.options.animation).toBe(false);
    });

    it("prefers-reduced-motion: reduce collapses waterfall animation to false at render time", () => {
      installMatchMedia(true);
      render(<WaterfallChart data={WATERFALL_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toBe(false);
    });

    it("prefers-reduced-motion: reduce collapses cost-benefit animation to false", () => {
      installMatchMedia(true);
      render(<CostBenefitChart data={COSTBENEFIT_FIXTURE} />);
      const props = barSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toBe(false);
    });

    it("prefers-reduced-motion: reduce collapses macro animation to false", () => {
      installMatchMedia(true);
      render(<MacroEconomicChart />);
      const props = lineSpy.mock.calls.at(-1)[0];
      expect(props.options.animation).toBe(false);
    });
  });

  describe("macro chart point sizing", () => {
    it("emits pointRadius / pointHoverRadius / pointHitRadius on every dataset", () => {
      render(<MacroEconomicChart />);
      const props = lineSpy.mock.calls.at(-1)[0];
      expect(props.data.datasets.length).toBeGreaterThan(0);
      for (const dataset of props.data.datasets) {
        expect(dataset.pointRadius).toBe(4);
        expect(dataset.pointHoverRadius).toBe(7);
        expect(dataset.pointHitRadius).toBe(16);
      }
    });
  });
});
