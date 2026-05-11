import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveScenarioMock = vi.fn();
const fetchReportsMock = vi.fn();
const loadScenariosMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    saveScenario: (...args) => saveScenarioMock(...args),
    createSnapshot: vi.fn(),
  },
}));

vi.mock("leaflet", () => ({
  default: {
    simpleMapScreenshoter: () => ({ addTo: () => ({ takeScreen: vi.fn() }) }),
  },
}));
vi.mock("leaflet-simple-map-screenshoter", () => ({}));

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({ fetchReports: fetchReportsMock }),
}));

const setStateBag = {
  activeViewControl: "display_map",
  isScenarioRunCompleted: true,
  mapTitle: "Egypt — flood rcp85",
  scenarioRunCode: "scen-1",
  selectedTab: "risk",
  activeMap: "risk",
  activeMapRef: { _fake: "map" },
  setAlertMessage: vi.fn(),
  setAlertSeverity: vi.fn(),
  setAlertShowMessage: vi.fn(),
  waterfallChartRef: null,
  costBenefitChartRef: null,
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

let MainViewToolbar;

beforeAll(async () => {
  ({ default: MainViewToolbar } = await import("../components/main/MainViewToolbar"));
});

beforeEach(() => {
  saveScenarioMock.mockReset();
  fetchReportsMock.mockReset();
  loadScenariosMock.mockReset();
  stateRef.current = { ...setStateBag };
});

describe("Save scenario button (analysis tab toolbar)", () => {
  it("does not render outside the analysis tab", () => {
    stateRef.current = { ...setStateBag, selectedTab: "parameters" };
    const { container } = render(<MainViewToolbar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is disabled before any scenario has been run", () => {
    stateRef.current = {
      ...setStateBag,
      isScenarioRunCompleted: false,
      scenarioRunCode: "",
    };
    render(<MainViewToolbar />);
    const button = screen.getByRole("button", { name: "save_scenario_button_aria" });
    expect(button).toBeDisabled();
  });

  it("re-opens the save dialog with the run's id and prefilled name after dismissal", async () => {
    render(<MainViewToolbar />);
    const button = screen.getByRole("button", { name: "save_scenario_button_aria" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(screen.getByText("save_scenario_dialog_title")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("save_scenario_name_label", { exact: false });
    expect(nameInput.value).toBe("Egypt — flood rcp85");

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("save_scenario_dialog_title")).not.toBeInTheDocument()
    );

    fireEvent.click(button);
    expect(screen.getByText("save_scenario_dialog_title")).toBeInTheDocument();
    expect(screen.getByLabelText("save_scenario_name_label", { exact: false }).value).toBe(
      "Egypt — flood rcp85"
    );
  });

  it("calls fetchReports + workspace reload after a successful save", async () => {
    saveScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "scen-1" } },
    });

    render(<MainViewToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "save_scenario_button_aria" }));
    fireEvent.click(screen.getByRole("button", { name: "save_scenario_action" }));

    await waitFor(() =>
      expect(saveScenarioMock).toHaveBeenCalledWith("scen-1", expect.any(Object))
    );
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalled());
    expect(loadScenariosMock).toHaveBeenCalledWith({ force: true });
  });
});
