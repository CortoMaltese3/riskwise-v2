import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createSnapshotMock = vi.fn();
const loadScenariosMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    createSnapshot: (...args) => createSnapshotMock(...args),
  },
}));

vi.mock("leaflet", () => ({
  default: {
    simpleMapScreenshoter: () => ({
      addTo: () => ({
        takeScreen: () => Promise.resolve(new Blob(["x"], { type: "image/png" })),
      }),
    }),
  },
}));
vi.mock("leaflet-simple-map-screenshoter", () => ({}));

const setStateBag = {
  // Defaults match an unfinished run — the camera should be disabled.
  // ``activeMap`` mirrors the live UI state (#362): map captures forward
  // the domain through ``surface`` so the PDF report can route the figure
  // into the right per-domain section.
  activeMap: "hazard",
  activeMapRef: { _fake: "map" },
  activeViewControl: "display_map",
  isScenarioRunCompleted: false,
  scenarioRunCode: "",
  selectedSubTab: 0,
  selectedTab: "risk",
  setSelectedSubTab: vi.fn(),
  setActiveViewControl: vi.fn(),
  setAlertMessage: vi.fn(),
  setAlertSeverity: vi.fn(),
  setAlertShowMessage: vi.fn(),
  waterfallChartRef: { toBase64Image: () => "data:image/png;base64,Zm9v" },
  costBenefitChartRef: { toBase64Image: () => "data:image/png;base64,Zm9v" },
  reports: [],
  selectedReport: null,
  selectedAnnualGrowth: 0,
  selectedCountry: "Egypt",
  selectedExposure: "assets",
  selectedExposureCategory: "economic",
  selectedHazard: "flood",
  selectedScenario: "rcp85",
  selectedTimeHorizon: 2050,
  addReport: vi.fn(),
};

const stateRef = { current: { ...setStateBag } };

const makeSelectorStore = () => {
  const fn = (selector) => selector(stateRef.current);
  fn.getState = () => stateRef.current;
  fn.setState = (patch) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };
  return fn;
};

vi.mock("../store/useUIStore", () => ({ default: makeSelectorStore() }));
vi.mock("../store/useResultsStore", () => ({ default: makeSelectorStore() }));
vi.mock("../store/useWorkspaceStore", () => {
  const fn = (selector) => selector({ ...stateRef.current, loadScenarios: loadScenariosMock });
  fn.getState = () => ({ ...stateRef.current, loadScenarios: loadScenariosMock });
  fn.setState = (patch) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };
  return { default: fn };
});

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({ fetchReports: vi.fn() }),
}));

let MainViewToolbar;

beforeAll(async () => {
  ({ default: MainViewToolbar } = await import("../components/main/MainViewToolbar"));
});

beforeEach(() => {
  createSnapshotMock.mockReset();
  loadScenariosMock.mockReset();
  stateRef.current = { ...setStateBag };
  // Provide FileReader stub since jsdom's may not produce a clean data URL.
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/png;base64,YWFh";
      this.onloadend && this.onloadend();
    }
  };
});

describe("snapshot capture button", () => {
  it("is disabled before a scenario run completes", async () => {
    render(<MainViewToolbar />);
    const button = screen.getByLabelText("workspace_snapshot_capture_aria");
    expect(button).toBeDisabled();
  });

  it("captures the active map and POSTs the bytes when run is complete", async () => {
    stateRef.current = {
      ...setStateBag,
      scenarioRunCode: "scen-1",
      isScenarioRunCompleted: true,
      activeViewControl: "display_map",
    };
    createSnapshotMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "snap-1" } },
    });

    render(<MainViewToolbar />);
    const button = screen.getByLabelText("workspace_snapshot_capture_aria");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(createSnapshotMock).toHaveBeenCalledTimes(1));
    expect(createSnapshotMock).toHaveBeenCalledWith("scen-1", {
      snapshot_type: "map",
      image_base64: "YWFh",
      // #362: ``activeMap`` propagates as ``surface`` so the snapshot can
      // be routed to the hazard/exposure/impact section in the PDF report.
      surface: "hazard",
    });
    expect(loadScenariosMock).toHaveBeenCalledWith({ force: true });
  });
});
