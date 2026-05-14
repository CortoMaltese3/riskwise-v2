import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import "../i18nConfig";

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    fetchWaterfallData: vi.fn().mockResolvedValue({
      success: true,
      result: {
        status: { code: 3000, message: "Waterfall data not available." },
        data: null,
      },
    }),
  },
}));

vi.mock("../components/charts/WaterfallChart", () => ({
  default: () => <div data-testid="waterfall-chart" />,
}));

import RiskChartLayout from "../components/controls/RiskChartLayout";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";

describe("Risk → Adaptation deep-link (#375)", () => {
  let resultsSnapshot;
  let uiSnapshot;

  beforeEach(() => {
    resultsSnapshot = useResultsStore.getState();
    uiSnapshot = useUIStore.getState();
    useResultsStore.setState({
      isScenarioRunning: false,
      isScenarioRunCompleted: false,
    });
    useUIStore.setState({ activeSection: "risk" });
  });

  afterEach(() => {
    useResultsStore.setState(resultsSnapshot, true);
    useUIStore.setState(uiSnapshot, true);
  });

  it("hides the deep-link button before a scenario has completed", async () => {
    render(<RiskChartLayout />);
    await act(async () => {});
    expect(
      screen.queryByRole("button", { name: /view this scenario as adaptation analysis/i })
    ).not.toBeInTheDocument();
  });

  it("renders the deep-link button with the expected aria-label once the scenario has completed", async () => {
    useResultsStore.setState({ isScenarioRunCompleted: true });
    render(<RiskChartLayout />);

    const button = await screen.findByRole("button", {
      name: "View this scenario as adaptation analysis",
    });
    expect(button).toHaveTextContent("View as adaptation →");
  });

  it("routes to the Adaptation section when clicked", async () => {
    useResultsStore.setState({ isScenarioRunCompleted: true });
    render(<RiskChartLayout />);

    const button = await screen.findByRole("button", {
      name: "View this scenario as adaptation analysis",
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(useUIStore.getState().activeSection).toBe("adaptation");
    });
  });
});
