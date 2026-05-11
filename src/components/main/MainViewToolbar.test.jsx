// Tests for #365: the snapshot camera button must distinguish between
// idle / capturing / disabled-no-run / disabled-chart-surface, and must
// disable itself on the waterfall and cost-benefit chart panes where a
// manual snapshot adds no value (the PDF report renders those charts
// directly from the data).
import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const handleCaptureSnapshotMock = vi.fn();
vi.mock("../../utils/mapTools", () => ({
  useMapTools: () => ({ handleCaptureSnapshot: handleCaptureSnapshotMock }),
}));

vi.mock("../../utils/reportTools", () => ({
  useReportTools: () => ({ fetchReports: vi.fn() }),
}));

// Minimal stand-in for the SaveScenarioDialog — the tests here only care
// about the camera button, so we skip rendering the real dialog tree.
vi.mock("../workspace/SaveScenarioDialog", () => ({
  default: () => null,
}));

const baseState = {
  activeViewControl: "display_map",
  isScenarioRunCompleted: true,
  mapTitle: "",
  scenarioRunCode: "scen-1",
  selectedSubTab: 0,
  selectedTab: "risk",
};

const stateRef = { current: { ...baseState } };

const makeSelectorStore = (extras = {}) => {
  const fn = (selector) => selector({ ...stateRef.current, ...extras });
  fn.getState = () => ({ ...stateRef.current, ...extras });
  fn.setState = (patch) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };
  return fn;
};

const loadScenariosMock = vi.fn();

vi.mock("../../store/useUIStore", () => ({ default: makeSelectorStore() }));
vi.mock("../../store/useResultsStore", () => ({ default: makeSelectorStore() }));
vi.mock("../../store/useWorkspaceStore", () => {
  const fn = (selector) => selector({ ...stateRef.current, loadScenarios: loadScenariosMock });
  fn.getState = () => ({ ...stateRef.current, loadScenarios: loadScenariosMock });
  fn.setState = (patch) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };
  return { default: fn };
});

let MainViewToolbar;

beforeAll(async () => {
  ({ default: MainViewToolbar } = await import("./MainViewToolbar"));
});

beforeEach(() => {
  stateRef.current = { ...baseState };
  handleCaptureSnapshotMock.mockReset();
  loadScenariosMock.mockReset();
});

const getCameraButton = () => screen.getByLabelText("workspace_snapshot_capture_aria");

const expectTooltipText = async (button, key) => {
  await userEvent.hover(button.closest("span") || button);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toBe(key);
};

describe("MainViewToolbar — snapshot camera button", () => {
  it("renders the camera icon and is enabled on the map view with a completed run", async () => {
    render(<MainViewToolbar />);
    const button = getCameraButton();
    expect(button).not.toBeDisabled();
    // PhotoCameraIcon — MUI tags every icon with a data-testid matching the icon name.
    expect(screen.getByTestId("PhotoCameraIcon")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { hidden: true })).not.toBeInTheDocument();
    await expectTooltipText(button, "workspace_snapshot_capture_tooltip");
  });

  it("swaps the icon for a spinner and disables itself while a capture is in flight", async () => {
    let resolveCapture;
    handleCaptureSnapshotMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        })
    );

    render(<MainViewToolbar />);
    const button = getCameraButton();
    expect(button).not.toBeDisabled();

    // Fire the click and let React process the state transition before asserting.
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(getCameraButton()).toBeDisabled());
    expect(screen.queryByTestId("PhotoCameraIcon")).not.toBeInTheDocument();
    // The spinner is aria-hidden (the tooltip carries the semantic), so we
    // have to opt in to hidden elements when querying by role.
    expect(screen.getByRole("progressbar", { hidden: true })).toBeInTheDocument();
    await expectTooltipText(getCameraButton(), "workspace_snapshot_capturing_tooltip");

    // Resolve the in-flight capture so the component returns to idle and we
    // avoid leaking a pending promise into the next test.
    await act(async () => {
      resolveCapture();
      await Promise.resolve();
    });
    await waitFor(() => expect(getCameraButton()).not.toBeDisabled());
  });

  it("is disabled with the no-run tooltip when no scenario has been run", async () => {
    stateRef.current = { ...baseState, scenarioRunCode: "", isScenarioRunCompleted: false };
    render(<MainViewToolbar />);
    const button = getCameraButton();
    expect(button).toBeDisabled();
    await expectTooltipText(button, "workspace_snapshot_disabled_no_run_tooltip");
  });

  it("is disabled with the chart tooltip on the waterfall sub-tab", async () => {
    stateRef.current = { ...baseState, activeViewControl: "display_chart", selectedSubTab: 0 };
    render(<MainViewToolbar />);
    const button = getCameraButton();
    expect(button).toBeDisabled();
    await expectTooltipText(button, "workspace_snapshot_disabled_chart_tooltip");
  });

  it("is disabled with the chart tooltip on the cost-benefit sub-tab", async () => {
    stateRef.current = { ...baseState, activeViewControl: "display_chart", selectedSubTab: 1 };
    render(<MainViewToolbar />);
    const button = getCameraButton();
    expect(button).toBeDisabled();
    await expectTooltipText(button, "workspace_snapshot_disabled_chart_tooltip");
  });

  it("is enabled again when switching back to the map view", async () => {
    stateRef.current = { ...baseState, activeViewControl: "display_map" };
    render(<MainViewToolbar />);
    expect(getCameraButton()).not.toBeDisabled();
  });
});
