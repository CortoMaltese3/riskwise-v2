import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import "../i18nConfig";

vi.mock("../components/map/HazardMap", () => ({
  default: () => <div data-testid="hazard-map" />,
}));
vi.mock("../components/map/ExposureMap", () => ({
  default: () => <div data-testid="exposure-map" />,
}));
vi.mock("../components/map/RiskMap", () => ({
  default: () => <div data-testid="risk-map" />,
}));

import MapLayout from "../components/map/MapLayout";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";

describe("MapLayout state coverage", () => {
  let uiSnapshot;
  let resultsSnapshot;

  beforeEach(() => {
    uiSnapshot = useUIStore.getState();
    resultsSnapshot = useResultsStore.getState();
    useResultsStore.setState({ isScenarioRunning: false, isScenarioRunCompleted: false });
    useUIStore.setState({ activeMap: "hazard" });
  });

  afterEach(() => {
    useUIStore.setState(uiSnapshot, true);
    useResultsStore.setState(resultsSnapshot, true);
  });

  it("renders the empty-state placeholder pre-run", () => {
    render(<MapLayout />);

    const placeholder = screen.getByTestId("map-empty-state");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/run a scenario to see the map/i)).toBeInTheDocument();
    expect(screen.queryByTestId("map-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hazard-map")).not.toBeInTheDocument();
  });

  it("loading state takes precedence over the empty state", () => {
    useResultsStore.setState({ isScenarioRunning: true });
    render(<MapLayout />);

    expect(screen.getByTestId("map-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("map-empty-state")).not.toBeInTheDocument();
  });

  it("renders the populated map once a scenario has completed", () => {
    useResultsStore.setState({ isScenarioRunCompleted: true });
    useUIStore.setState({ activeMap: "hazard" });
    render(<MapLayout />);

    expect(screen.getByTestId("hazard-map")).toBeInTheDocument();
    expect(screen.queryByTestId("map-empty-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-skeleton")).not.toBeInTheDocument();
  });
});
