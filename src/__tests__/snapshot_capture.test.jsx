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
  activeMap: "risk",
  activeMapRef: { _fake: "map" },
  activeViewControl: "display_map",
  isScenarioRunCompleted: false,
  scenarioRunCode: "",
  selectedSubTab: 0,
  selectedTab: 1,
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
  selectedExposureEconomic: "assets",
  selectedExposureNonEconomic: "",
  selectedHazard: "flood",
  selectedScenario: "rcp85",
  selectedTimeHorizon: 2050,
  addReport: vi.fn(),
};

const stateRef = { current: { ...setStateBag } };

vi.mock("../store", () => ({
  default: () => stateRef.current,
}));

vi.mock("../store/workspaceSlice", () => {
  const useWorkspaceStore = (selector) => selector({ loadScenarios: loadScenariosMock });
  useWorkspaceStore.getState = () => ({ loadScenarios: loadScenariosMock });
  return { default: useWorkspaceStore };
});

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({ fetchReports: vi.fn() }),
}));

let MainSubTabs;

beforeAll(async () => {
  ({ default: MainSubTabs } = await import("../components/main/MainSubTabs"));
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
    render(<MainSubTabs />);
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

    render(<MainSubTabs />);
    const button = screen.getByLabelText("workspace_snapshot_capture_aria");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(createSnapshotMock).toHaveBeenCalledTimes(1));
    expect(createSnapshotMock).toHaveBeenCalledWith("scen-1", {
      snapshot_type: "map",
      image_base64: "YWFh",
    });
    expect(loadScenariosMock).toHaveBeenCalledWith({ force: true });
  });
});
