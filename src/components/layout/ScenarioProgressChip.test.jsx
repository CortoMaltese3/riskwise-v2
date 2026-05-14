// Coverage for #401: ScenarioProgressChip phase / cancel / fade behaviour.
//
// The chip replaces the previous full-screen ProgressOverlay with a
// non-blocking bottom-left surface. These tests pin the contract the chip
// promises to the rest of the app: render only on a non-null phase,
// observe the IPC step label, present the right header/affordances per
// phase, run the two-stage cancel correctly, and auto-fade after 10s.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

const { cancelScenarioMock } = vi.hoisted(() => ({
  cancelScenarioMock: vi.fn(),
}));

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

vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    cancelScenario: cancelScenarioMock,
  },
}));

vi.mock("../../hooks/useToast", () => ({
  enqueueToast: vi.fn(),
}));

import ScenarioProgressChip from "./ScenarioProgressChip";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const setStorePhase = (phase, summary = null) => {
  useResultsStore.setState({ scenarioPhase: phase, activeRunSummary: summary });
};

beforeEach(() => {
  cancelScenarioMock.mockReset();
  useResultsStore.setState({
    scenarioPhase: null,
    activeRunSummary: null,
    isScenarioRunning: false,
  });
  useUIStore.setState({ modalMessage: "", progress: 0 });
  useWorkspaceStore.setState({ scenarioRunCode: "scen-42" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScenarioProgressChip", () => {
  it("renders nothing when scenarioPhase is null", () => {
    render(<ScenarioProgressChip />);
    expect(screen.queryByTestId("progress-step-label")).toBeNull();
  });

  it("shows running title with indeterminate progress when phase=running and progress=0", () => {
    setStorePhase("running");
    render(<ScenarioProgressChip />);
    expect(screen.getByText("scenario_chip_running_title")).toBeInTheDocument();
    const bar = document.querySelector(".MuiLinearProgress-indeterminate");
    expect(bar).not.toBeNull();
  });

  it("renders determinate progress when progress is between 1 and 100", () => {
    setStorePhase("running");
    useUIStore.setState({ progress: 50 });
    render(<ScenarioProgressChip />);
    const determinate = document.querySelector(".MuiLinearProgress-determinate");
    expect(determinate).not.toBeNull();
    expect(determinate.getAttribute("aria-valuenow")).toBe("50");
  });

  it("preserves aria-live=polite on the step label", () => {
    setStorePhase("running");
    useUIStore.setState({ modalMessage: "Loading exposure" });
    render(<ScenarioProgressChip />);
    const label = screen.getByTestId("progress-step-label");
    expect(label.getAttribute("aria-live")).toBe("polite");
    expect(label).toHaveTextContent("Loading exposure");
  });

  it("first cancel click flips the label; not clicking again within 3s reverts it", () => {
    vi.useFakeTimers();
    setStorePhase("running");
    render(<ScenarioProgressChip />);
    const button = screen.getByTestId("scenario-chip-cancel");
    expect(button).toHaveTextContent("scenario_chip_cancel");
    fireEvent.click(button);
    expect(button).toHaveTextContent("scenario_chip_cancel_confirm");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(button).toHaveTextContent("scenario_chip_cancel");
  });

  it("second cancel click within 3s invokes cancelScenario and sets phase to cancelling", async () => {
    vi.useFakeTimers();
    cancelScenarioMock.mockImplementation(
      () => new Promise(() => {}) // pending — chip stays in cancelling
    );
    setStorePhase("running");
    render(<ScenarioProgressChip />);
    const button = screen.getByTestId("scenario-chip-cancel");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(cancelScenarioMock).toHaveBeenCalledWith("scen-42");
    expect(useResultsStore.getState().scenarioPhase).toBe("cancelling");
  });

  it("during cancelling, the cancel button is replaced by a spinner", () => {
    setStorePhase("cancelling");
    render(<ScenarioProgressChip />);
    expect(screen.queryByTestId("scenario-chip-cancel")).toBeNull();
    expect(screen.getByTestId("scenario-chip-cancelling")).toBeInTheDocument();
  });

  it("on completed, View results calls setSelectedTab with the captured landingTab", () => {
    const setSelectedTab = vi.fn();
    useUIStore.setState({ setSelectedTab });
    setStorePhase("completed", {
      country: "Egypt",
      hazard: "flood",
      timeHorizonStart: 2024,
      timeHorizonEnd: 2050,
      landingTab: "adaptation",
    });
    render(<ScenarioProgressChip />);
    fireEvent.click(screen.getByTestId("scenario-chip-view-results"));
    expect(setSelectedTab).toHaveBeenCalledWith("adaptation");
    expect(useResultsStore.getState().scenarioPhase).toBeNull();
    expect(useResultsStore.getState().activeRunSummary).toBeNull();
  });

  it("auto-fades 10s after entering a terminal phase", () => {
    vi.useFakeTimers();
    setStorePhase("completed", {
      country: "Egypt",
      hazard: "flood",
      timeHorizonStart: 2024,
      timeHorizonEnd: 2050,
      landingTab: "risk",
    });
    render(<ScenarioProgressChip />);
    expect(useResultsStore.getState().scenarioPhase).toBe("completed");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(useResultsStore.getState().scenarioPhase).toBeNull();
    expect(useResultsStore.getState().activeRunSummary).toBeNull();
  });

  it("close button on a terminal phase resets immediately, skipping the 10s fade", () => {
    vi.useFakeTimers();
    setStorePhase("failed", {
      country: "Egypt",
      hazard: "flood",
      timeHorizonStart: 2024,
      timeHorizonEnd: 2050,
      landingTab: "risk",
    });
    render(<ScenarioProgressChip />);
    fireEvent.click(screen.getByLabelText("scenario_chip_close_aria"));
    expect(useResultsStore.getState().scenarioPhase).toBeNull();
  });

  it("does not mount a full-screen MUI Backdrop while a scenario runs", () => {
    useResultsStore.setState({ isScenarioRunning: true, scenarioPhase: "running" });
    render(<ScenarioProgressChip />);
    expect(document.querySelector(".MuiBackdrop-root")).toBeNull();
  });
});
