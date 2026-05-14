import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

import enLocale from "../locales/en.json";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const base = enLocale[key] ?? key;
      if (opts && typeof opts === "object") {
        return Object.entries(opts).reduce(
          (out, [k, v]) => out.replaceAll(`{{${k}}}`, String(v)),
          base
        );
      }
      return base;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="chart-stub" />,
}));
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

vi.mock("../components/results/ResultsTypography", () => ({
  default: () => <div data-testid="results-typography-stub" />,
}));

import EconomicResultsCard from "../components/results/EconomicResultsCard";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";

const SPEC = {
  id: 101,
  name: "Buddhist monks",
  haz_type: "FL",
  exp_type: "Buddhist monks",
  intensity_unit: "m",
  intensity: [0, 1, 2],
  mdd: [0, 0.5, 1],
  paa: [1, 1, 1],
};

const renderCard = () =>
  render(
    <ThemeProvider theme={theme}>
      <EconomicResultsCard />
    </ThemeProvider>
  );

beforeEach(() => {
  useResultsStore.setState({ activeRunSummary: null });
  useUIStore.setState({ activeMap: "hazard", activeViewControl: "display_chart" });
});

afterEach(() => {
  cleanup();
});

describe("EconomicResultsCard — secondary impact-function entry point", () => {
  it("hides the link when the run carries no impact function", () => {
    useResultsStore.setState({
      activeRunSummary: {
        country: "Egypt",
        hazard: "flood",
        exposure: "diarrhea_patients",
        timeHorizonStart: 2024,
        timeHorizonEnd: 2050,
        impactFunction: null,
      },
    });
    renderCard();
    expect(screen.queryByTestId("results-view-impact-function")).toBeNull();
  });

  it("renders the link when activeRunSummary holds the IF", () => {
    useResultsStore.setState({
      activeRunSummary: {
        country: "Thailand",
        hazard: "flood",
        exposure: "buddhist_monks",
        timeHorizonStart: 2024,
        timeHorizonEnd: 2050,
        impactFunction: SPEC,
      },
    });
    renderCard();
    expect(screen.getByTestId("results-view-impact-function")).toBeInTheDocument();
  });

  it("opens the impact-function dialog when clicked", () => {
    useResultsStore.setState({
      activeRunSummary: {
        country: "Thailand",
        hazard: "flood",
        exposure: "buddhist_monks",
        timeHorizonStart: 2024,
        timeHorizonEnd: 2050,
        impactFunction: SPEC,
      },
    });
    renderCard();
    fireEvent.click(screen.getByTestId("results-view-impact-function"));
    // The dialog renders the same id/name copy as the input-side card.
    expect(screen.getByText("Impact function 101 — Buddhist monks")).toBeInTheDocument();
  });
});
