// Coverage for #437: home ActiveRunCard surfaces the current scenario run on
// the home page. Tests pin the contract: null phase renders nothing, running
// phase shows title + summary + progress bar, completed phase shows a
// "View results" button that switches the active section and the landing tab.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts === "object") {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

import ActiveRunCard from "./ActiveRunCard";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";

const setStorePhase = (phase, summary = null) => {
  useResultsStore.setState({ scenarioPhase: phase, activeRunSummary: summary });
};

beforeEach(() => {
  useResultsStore.setState({
    scenarioPhase: null,
    activeRunSummary: null,
    isScenarioRunning: false,
  });
  useUIStore.setState({ modalMessage: "", progress: 0, activeSection: "home" });
});

afterEach(() => {
  cleanup();
});

describe("ActiveRunCard", () => {
  it("renders nothing when scenarioPhase is null", () => {
    render(<ActiveRunCard />);
    expect(screen.queryByTestId("home-active-run-card")).toBeNull();
  });

  it("shows running title, summary, and indeterminate progress bar when phase=running", () => {
    setStorePhase("running", {
      country: "Egypt",
      hazard: "flood",
      timeHorizonStart: 2030,
      timeHorizonEnd: 2050,
    });
    useUIStore.setState({ modalMessage: "Loading exposure" });
    render(<ActiveRunCard />);
    expect(screen.getByTestId("home-active-run-card")).toBeInTheDocument();
    expect(screen.getByText("home_active_run_title_running")).toBeInTheDocument();
    expect(screen.getByTestId("home-active-run-step-label")).toHaveTextContent("Loading exposure");
    expect(
      screen.getByText(
        'home_active_run_summary:{"country":"Egypt","hazard":"flood","from":2030,"to":2050}'
      )
    ).toBeInTheDocument();
    const indeterminate = document.querySelector(".MuiLinearProgress-indeterminate");
    expect(indeterminate).not.toBeNull();
  });

  it("renders determinate progress when progress is between 1 and 100", () => {
    setStorePhase("running");
    useUIStore.setState({ progress: 42 });
    render(<ActiveRunCard />);
    const determinate = document.querySelector(".MuiLinearProgress-determinate");
    expect(determinate).not.toBeNull();
    expect(determinate.getAttribute("aria-valuenow")).toBe("42");
  });

  it("shows starting placeholder step label when modalMessage is empty", () => {
    setStorePhase("running");
    render(<ActiveRunCard />);
    expect(screen.getByTestId("home-active-run-step-label")).toHaveTextContent("Starting…");
  });

  it("shows completed title and View results button on completed phase", () => {
    setStorePhase("completed", { landingTab: "risk" });
    render(<ActiveRunCard />);
    expect(screen.getByText("home_active_run_title_completed")).toBeInTheDocument();
    expect(screen.getByTestId("home-active-run-view-results")).toBeInTheDocument();
    expect(document.querySelector(".MuiLinearProgress-root")).toBeNull();
  });

  it("View results switches to workspace, sets landingTab, and clears the phase", () => {
    setStorePhase("completed", { landingTab: "risk" });
    render(<ActiveRunCard />);
    fireEvent.click(screen.getByTestId("home-active-run-view-results"));
    expect(useUIStore.getState().activeSection).toBe("workspace");
    expect(useUIStore.getState().selectedTab).toBe("risk");
    expect(useResultsStore.getState().scenarioPhase).toBeNull();
  });

  it("failed phase shows the failed title but no progress bar and no action", () => {
    setStorePhase("failed");
    render(<ActiveRunCard />);
    expect(screen.getByText("home_active_run_title_failed")).toBeInTheDocument();
    expect(document.querySelector(".MuiLinearProgress-root")).toBeNull();
    expect(screen.queryByTestId("home-active-run-view-results")).toBeNull();
  });
});
