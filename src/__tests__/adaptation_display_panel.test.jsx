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
  useUIStore.setState({ activeViewControl: "display_chart", resultDetailsOpen: false });
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

  it("renders large totals with compact notation so the unit fits on one line (#412 B3)", () => {
    useResultsStore.setState({
      costBenefitData: {
        currency_unit: "USD",
        present_year: 2024,
        future_year: 2050,
        measures: [
          {
            name: "Megaproject",
            cost: 100_000_000,
            benefit: 137_753_958.38,
            benefit_cost_ratio: 1.38,
          },
        ],
      },
    });
    renderWithTheme(<AdaptationDisplayPanel />);
    const card = screen.getByTestId("adaptation-summary-card");
    // Compact notation collapses the eight-digit absolute value into "137.75M".
    expect(card.textContent).toMatch(/137\.75M USD/);
    // Make sure the un-compacted long form is no longer rendered.
    expect(card.textContent).not.toMatch(/137,753,958/);
  });

  it("collapses the Result details body by default and toggles via the button (#412 C3)", () => {
    renderWithTheme(<AdaptationDisplayPanel />);
    expect(screen.queryByTestId("adaptation-result-details-body")).not.toBeInTheDocument();
    const toggle = screen.getByTestId("adaptation-result-details-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("result_details_show");

    fireEvent.click(toggle);
    expect(useUIStore.getState().resultDetailsOpen).toBe(true);
    expect(screen.getByTestId("adaptation-result-details-body")).toBeInTheDocument();
    expect(screen.getByTestId("adaptation-result-details-toggle")).toHaveTextContent(
      "result_details_hide"
    );

    fireEvent.click(screen.getByTestId("adaptation-result-details-toggle"));
    expect(useUIStore.getState().resultDetailsOpen).toBe(false);
  });

  it("no longer renders the duplicate chart/map switcher in the side panel (#412 D1)", () => {
    renderWithTheme(<AdaptationDisplayPanel />);
    expect(screen.queryByTestId("adaptation-display-map-button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "adaptation_display_chart_button" })
    ).not.toBeInTheDocument();
  });
});
