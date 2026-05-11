import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

import AdaptationDisplayPanel from "../components/adaptation/AdaptationDisplayPanel";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockPayload = {
  currency_unit: "USD",
  present_year: 2024,
  future_year: 2050,
  measures: [
    { name: "Seawall", cost: 100, benefit: 250, benefit_cost_ratio: 2.5 },
    { name: "Levee", cost: 100, benefit: 150, benefit_cost_ratio: 1.5 },
    { name: "Pumps", cost: 100, benefit: 110, benefit_cost_ratio: 1.1 },
    { name: "Dunes", cost: 100, benefit: 80, benefit_cost_ratio: 0.8 },
    { name: "Mangroves", cost: 100, benefit: 50, benefit_cost_ratio: 0.5 },
    { name: "Sandbags", cost: 100, benefit: 0, benefit_cost_ratio: 0 },
  ],
};

beforeEach(() => {
  useResultsStore.setState({
    costBenefitData: null,
    isCostBenefitLoading: false,
    costBenefitError: "",
  });
  useUIStore.setState({ activeViewControl: "display_chart" });
});

describe("AdaptationDisplayPanel", () => {
  it("renders derived counts, best-ratio measure, and totals from the payload", () => {
    useResultsStore.setState({ costBenefitData: mockPayload });
    renderWithTheme(<AdaptationDisplayPanel />);

    const card = screen.getByTestId("adaptation-summary-card");
    expect(card).toHaveTextContent("adaptation_summary_profitable");
    expect(card).toHaveTextContent("3");
    expect(card).toHaveTextContent("adaptation_summary_marginal");
    expect(card).toHaveTextContent("2");
    expect(card).toHaveTextContent("adaptation_summary_loss");
    expect(card).toHaveTextContent("1");
    expect(card).toHaveTextContent("Seawall");
    expect(card).toHaveTextContent("2.50");
    expect(card).toHaveTextContent("600 USD");
    expect(card).toHaveTextContent("640 USD");
  });

  it("renders em-dashes for every row when no data is available", () => {
    renderWithTheme(<AdaptationDisplayPanel />);
    const card = screen.getByTestId("adaptation-summary-card");
    const dashCount = (card.textContent.match(/—/g) ?? []).length;
    expect(dashCount).toBe(6);
  });

  it("clicking Chart sets activeViewControl to display_chart and Map stays disabled", () => {
    useUIStore.setState({ activeViewControl: "display_map" });
    renderWithTheme(<AdaptationDisplayPanel />);

    const chartButton = screen.getByRole("button", { name: "adaptation_display_chart_button" });
    fireEvent.click(chartButton);
    expect(useUIStore.getState().activeViewControl).toBe("display_chart");

    const mapButton = screen.getByTestId("adaptation-display-map-button");
    expect(mapButton).toBeDisabled();
    fireEvent.click(mapButton);
    expect(useUIStore.getState().activeViewControl).toBe("display_chart");
  });

  it("renders skeleton placeholders for every summary row while loading", () => {
    useResultsStore.setState({ isCostBenefitLoading: true });
    renderWithTheme(<AdaptationDisplayPanel />);
    const skeletons = screen.getAllByTestId("adaptation-summary-skeleton");
    expect(skeletons).toHaveLength(6);
  });

  it("handles Infinity benefit-cost-ratio by falling back to the highest-benefit measure", () => {
    useResultsStore.setState({
      costBenefitData: {
        currency_unit: "",
        present_year: 2024,
        future_year: 2050,
        measures: [
          { name: "ZeroCostA", cost: 0, benefit: 100, benefit_cost_ratio: Infinity },
          { name: "ZeroCostB", cost: 0, benefit: 500, benefit_cost_ratio: Infinity },
        ],
      },
    });
    renderWithTheme(<AdaptationDisplayPanel />);
    const card = screen.getByTestId("adaptation-summary-card");
    expect(card).toHaveTextContent("ZeroCostB");
    expect(card.textContent).not.toMatch(/Infinity/);
  });
});
