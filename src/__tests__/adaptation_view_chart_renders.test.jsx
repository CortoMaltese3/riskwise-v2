// Coverage for #371: when a scenario has run and cost-benefit data is
// available, the AdaptationChartLayout renders the CostBenefitChart. The
// no-measures branch is exercised here too so the empty-state copy is
// guarded against silent regression.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

// `vi.mock` is hoisted above top-level `const`s; binding the mock fn via
// `vi.hoisted` ensures the factory can see it without hitting the TDZ.
const { fetchCostBenefitDataMock } = vi.hoisted(() => ({
  fetchCostBenefitDataMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: { fetchCostBenefitData: fetchCostBenefitDataMock },
}));

// The cost-benefit chart drags in chart.js + react-chartjs-2 which require
// a canvas. Stub it: the assertion is that the chart is mounted, not what
// it draws.
vi.mock("../components/charts/CostBenefitChart", () => {
  const Stub = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({}));
    return <div data-testid="cost-benefit-chart" data-measures={props.data?.measures?.length} />;
  });
  Stub.displayName = "CostBenefitChartStub";
  return { default: Stub };
});

import AdaptationChartLayout from "../components/controls/AdaptationChartLayout";
import useWorkspaceStore from "../store/useWorkspaceStore";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  fetchCostBenefitDataMock.mockReset();
  useWorkspaceStore.setState({ scenarioRunCode: "scn_abc" });
});

describe("AdaptationChartLayout chart rendering (#371)", () => {
  it("renders CostBenefitChart when the backend returns a non-empty measures list", async () => {
    fetchCostBenefitDataMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: {
          currency_unit: "USD",
          present_year: 2024,
          future_year: 2050,
          measures: [{ name: "Seawall", cost: 1000000, benefit: 2500000, benefit_cost_ratio: 2.5 }],
        },
      },
    });
    renderWithTheme(<AdaptationChartLayout />);
    await waitFor(() => expect(screen.getByTestId("cost-benefit-chart")).toBeInTheDocument());
    expect(screen.queryByTestId("adaptation-empty-state-no-measures")).not.toBeInTheDocument();
  });

  it("renders the no-measures empty state when the backend returns measures=[]", async () => {
    fetchCostBenefitDataMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: {
          currency_unit: "USD",
          present_year: 2024,
          future_year: 2050,
          measures: [],
        },
      },
    });
    renderWithTheme(<AdaptationChartLayout />);
    await waitFor(() =>
      expect(screen.getByTestId("adaptation-empty-state-no-measures")).toBeInTheDocument()
    );
    expect(screen.getByText("adaptation_empty_state_no_measures")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-benefit-chart")).not.toBeInTheDocument();
  });
});
