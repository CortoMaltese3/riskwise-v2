import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

const getScenarioMock = vi.fn();
const listScenariosMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    getScenario: (...args) => getScenarioMock(...args),
    listScenarios: (...args) => listScenariosMock(...args),
    deleteScenario: vi.fn(),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn(),
  },
}));

let useReportTools;
let useWorkspaceStore;
let useUIStore;
let WorkspaceView;

beforeAll(async () => {
  ({ useReportTools } = await import("../utils/reportTools"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: WorkspaceView } = await import("../components/workspace/WorkspaceView"));
}, 60000);

const buildScenarioResponse = (overrides = {}) => ({
  success: true,
  result: {
    status: { code: 2000 },
    data: {
      scenario: {
        id: "scn-7",
        name: "Egypt flood era",
        country: "Egypt",
        hazard_type: "flood",
        scenario: "rcp45",
        exposure_type: "buildings",
        asset_type: "residential",
        ref_year: 2020,
        future_year: 2050,
        annual_growth: 1.5,
        is_era: true,
        ...overrides,
      },
    },
  },
});

beforeEach(() => {
  getScenarioMock.mockReset();
  listScenariosMock.mockReset();
  listScenariosMock.mockResolvedValue({
    success: true,
    result: { status: { code: 2000 }, data: [] },
  });
  useWorkspaceStore.setState({
    selectedAppOption: "custom",
    selectedCountry: "",
    selectedHazard: "",
    selectedScenario: "",
    selectedExposure: "",
    selectedExposureCategory: null,
    selectedTimeHorizon: [2024, 2050],
    selectedAnnualGrowth: 0,
    isValidExposure: false,
    isValidHazard: false,
    scenarioRunCode: "",
    selectedScenarioRunCode: "",
    scenarios: [],
    selectedIds: [],
  });
  useUIStore.setState({ activeSection: "home" });
});

describe("restoreScenario", () => {
  it("sets selectedAppOption to 'era' when scenario.is_era is true and populates both run-code fields", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse({ is_era: true }));

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(true);
    const ws = useWorkspaceStore.getState();
    expect(ws.selectedAppOption).toBe("era");
    expect(ws.scenarioRunCode).toBe("scn-7");
    expect(ws.selectedScenarioRunCode).toBe("scn-7");
    expect(ws.isValidExposure).toBe(true);
    expect(ws.isValidHazard).toBe(true);
  });

  it("sets selectedAppOption to 'custom' when scenario.is_era is false", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse({ is_era: false }));

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(true);
    expect(useWorkspaceStore.getState().selectedAppOption).toBe("custom");
  });

  it("returns false and does not mutate workspace state when getScenario returns a non-2000 status", async () => {
    getScenarioMock.mockResolvedValue({
      success: false,
      result: { status: { code: 5000, message: "boom" }, data: null },
    });

    const before = useWorkspaceStore.getState();
    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(false);
    const after = useWorkspaceStore.getState();
    expect(after.selectedCountry).toBe(before.selectedCountry);
    expect(after.scenarioRunCode).toBe(before.scenarioRunCode);
    expect(after.selectedScenarioRunCode).toBe(before.selectedScenarioRunCode);
  });
});

describe("WorkspaceView restore action", () => {
  const FIXTURE = [
    {
      id: "scn-7",
      name: "Egypt flood era",
      country: "Egypt",
      hazard_type: "flood",
      tags: null,
      notes: null,
      status: "completed",
      created_at: "2026-04-20T10:00:00Z",
    },
  ];

  it("calls getScenario, navigates to the Risk section, and hydrates workspace inputs", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse());

    render(<WorkspaceView initialScenarios={FIXTURE} />);

    fireEvent.click(screen.getByLabelText("restore-scn-7"));

    await waitFor(() => expect(getScenarioMock).toHaveBeenCalledWith("scn-7"));
    await waitFor(() => expect(useUIStore.getState().activeSection).toBe("risk"));

    const ws = useWorkspaceStore.getState();
    expect(ws.selectedCountry).toBe("Egypt");
    expect(ws.selectedHazard).toBe("flood");
    expect(ws.selectedScenario).toBe("rcp45");
    expect(ws.selectedExposure).toBe("buildings");
    expect(ws.selectedTimeHorizon).toEqual([2020, 2050]);
    expect(ws.selectedAnnualGrowth).toBe(1.5);
    expect(ws.scenarioRunCode).toBe("scn-7");
    expect(ws.selectedScenarioRunCode).toBe("scn-7");
  });
});
