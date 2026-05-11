// Coverage for #372: the read-only Active Scenario card surfaces the
// last-run scenario context in the Adaptation view's left column. Card is
// hidden until at least one scenario run has completed, and individual
// missing fields collapse to an em dash without throwing.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en-US", changeLanguage: vi.fn() },
  }),
}));

import ActiveScenarioCard from "../components/adaptation/ActiveScenarioCard";
import useResultsStore from "../store/useResultsStore";
import useWorkspaceStore from "../store/useWorkspaceStore";

const fullyPopulatedWorkspace = {
  selectedCountry: "thailand",
  selectedHazard: "flood",
  selectedScenario: "rcp45",
  selectedTimeHorizon: [2024, 2050],
  selectedExposure: "crops",
  selectedExposureCategory: "economic",
  selectedAnnualGrowth: 2.94,
};

beforeEach(() => {
  useResultsStore.setState({ isScenarioRunCompleted: true });
  useWorkspaceStore.setState(fullyPopulatedWorkspace);
});

describe("ActiveScenarioCard (#372)", () => {
  it("renders all six rows with translated labels and values", () => {
    render(<ActiveScenarioCard />);

    expect(screen.getByText("adaptation_active_scenario_title")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_country")).toBeInTheDocument();
    expect(screen.getByText("input_country_thailand")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_hazard")).toBeInTheDocument();
    expect(screen.getByText("input_hazard_flood")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_scenario")).toBeInTheDocument();
    expect(screen.getByText("input_scenario_scenarios_rcp45")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_time_horizon")).toBeInTheDocument();
    expect(screen.getByText("2024 – 2050")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_exposure")).toBeInTheDocument();
    expect(screen.getByText("input_exposure_economic_crops")).toBeInTheDocument();

    expect(screen.getByText("adaptation_active_scenario_annual_growth")).toBeInTheDocument();
    expect(screen.getByText("2.94%")).toBeInTheDocument();
  });

  it("renders null when no scenario has been run yet", () => {
    useResultsStore.setState({ isScenarioRunCompleted: false });
    const { container } = render(<ActiveScenarioCard />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("active-scenario-card")).not.toBeInTheDocument();
  });

  it("falls back to an em dash for missing fields without throwing", () => {
    useWorkspaceStore.setState({
      selectedCountry: "",
      selectedHazard: "",
      selectedScenario: "",
      selectedTimeHorizon: [2024, 2050],
      selectedExposure: "",
      selectedExposureCategory: null,
      selectedAnnualGrowth: null,
    });

    render(<ActiveScenarioCard />);

    // Country, hazard, scenario, exposure, and annual growth all collapse to —
    expect(screen.getAllByText("—").length).toBe(5);
  });

  it("maps the historical scenario code to the scenario_historical_label key", () => {
    useWorkspaceStore.setState({
      ...fullyPopulatedWorkspace,
      selectedScenario: "historical",
    });

    render(<ActiveScenarioCard />);

    expect(screen.getByText("scenario_historical_label")).toBeInTheDocument();
    expect(screen.queryByText("input_scenario_scenarios_historical")).not.toBeInTheDocument();
  });
});
