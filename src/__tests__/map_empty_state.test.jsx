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
import useStore from "../store";

describe("MapLayout state coverage", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = useStore.getState();
    useStore.setState({
      isScenarioRunning: false,
      isScenarioRunCompleted: false,
      activeMap: "hazard",
    });
  });

  afterEach(() => {
    useStore.setState(snapshot, true);
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
    useStore.setState({ isScenarioRunning: true });
    render(<MapLayout />);

    expect(screen.getByTestId("map-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("map-empty-state")).not.toBeInTheDocument();
  });

  it("renders the populated map once a scenario has completed", () => {
    useStore.setState({ isScenarioRunCompleted: true, activeMap: "hazard" });
    render(<MapLayout />);

    expect(screen.getByTestId("hazard-map")).toBeInTheDocument();
    expect(screen.queryByTestId("map-empty-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-skeleton")).not.toBeInTheDocument();
  });
});
