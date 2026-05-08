import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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

describe("RiskChartLayout empty state", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = useResultsStore.getState();
    useResultsStore.setState({
      isScenarioRunning: false,
      isScenarioRunCompleted: false,
    });
  });

  afterEach(() => {
    useResultsStore.setState(snapshot, true);
  });

  it("renders the friendly empty-state placeholder pre-run", async () => {
    render(<RiskChartLayout />);

    const placeholder = await screen.findByTestId("waterfall-empty-state");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/run a future scenario to see the waterfall/i)).toBeInTheDocument();
    expect(screen.getByText(/baseline vs\. future risk components/i)).toBeInTheDocument();
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();
  });

  it("shows a skeleton while a scenario is running", async () => {
    useResultsStore.setState({ isScenarioRunning: true });
    render(<RiskChartLayout />);

    expect(await screen.findByTestId("waterfall-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("waterfall-empty-state")).not.toBeInTheDocument();
  });

  it("renders the chart once a scenario has completed and data is available", async () => {
    const RiskWiseClient = (await import("../lib/RiskWiseClient")).default;
    RiskWiseClient.fetchWaterfallData.mockResolvedValueOnce({
      success: true,
      result: {
        status: { code: 2000, message: "ok" },
        data: { categories: [{ key: "risk_present", label: "Present", value: 1, base: 0 }] },
      },
    });
    useResultsStore.setState({ isScenarioRunCompleted: true });

    render(<RiskChartLayout />);

    await waitFor(() => {
      expect(screen.getByTestId("waterfall-chart")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("waterfall-empty-state")).not.toBeInTheDocument();
  });
});
