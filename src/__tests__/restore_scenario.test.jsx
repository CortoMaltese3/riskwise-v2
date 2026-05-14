import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

const getScenarioMock = vi.fn();
const listScenariosMock = vi.fn();
const hydrateScenarioTempMock = vi.fn();
const fetchCostBenefitDataMock = vi.fn();
const runScenarioMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    getScenario: (...args) => getScenarioMock(...args),
    listScenarios: (...args) => listScenariosMock(...args),
    hydrateScenarioTemp: (...args) => hydrateScenarioTempMock(...args),
    fetchCostBenefitData: (...args) => fetchCostBenefitDataMock(...args),
    runScenario: (...args) => runScenarioMock(...args),
    deleteScenario: vi.fn(),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn(),
  },
}));

let useReportTools;
let useWorkspaceStore;
let useUIStore;
let useResultsStore;
let WorkspaceView;

beforeAll(async () => {
  ({ useReportTools } = await import("../utils/reportTools"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
  ({ default: WorkspaceView } = await import("../components/workspace/WorkspaceView"));
}, 60000);

const buildHydrateResponse = (written = ["hazard_geojson"]) => ({
  success: true,
  result: {
    status: { code: 2000, message: "Scenario hydrated." },
    data: { written },
  },
});

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

const buildCostBenefitResponse = (measures = []) => ({
  success: true,
  result: {
    status: { code: 2000, message: "Cost-benefit data fetched successfully." },
    data: {
      currency_unit: "USD",
      present_year: 2020,
      future_year: 2050,
      measures,
    },
  },
});

beforeEach(() => {
  getScenarioMock.mockReset();
  listScenariosMock.mockReset();
  hydrateScenarioTempMock.mockReset();
  fetchCostBenefitDataMock.mockReset();
  runScenarioMock.mockReset();
  hydrateScenarioTempMock.mockResolvedValue(buildHydrateResponse());
  fetchCostBenefitDataMock.mockResolvedValue(buildCostBenefitResponse());
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
    selectedMeasureIds: [],
    appliedMeasureIds: [],
    isMeasureSelectionInitialized: false,
    scenarios: [],
    selectedIds: [],
  });
  useUIStore.setState({ activeSection: "home" });
  useResultsStore.setState({ isScenarioRunCompleted: false });
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

  it("calls hydrateScenarioTemp before flipping isScenarioRunCompleted", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse());
    const callOrder = [];
    hydrateScenarioTempMock.mockImplementation(async () => {
      callOrder.push("hydrate");
      return buildHydrateResponse();
    });

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(true);
    expect(hydrateScenarioTempMock).toHaveBeenCalledWith("scn-7");
    expect(callOrder[0]).toBe("hydrate");
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(true);
  });

  it("hydrates measure selection from the restored cost-benefit blob so a re-run carries the saved measures (issue #428)", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse());
    fetchCostBenefitDataMock.mockResolvedValue(
      buildCostBenefitResponse([
        { name: "Levee", cost: 1, benefit: 2, benefit_cost_ratio: 2 },
        { name: "Drainage", cost: 1, benefit: 3, benefit_cost_ratio: 3 },
      ])
    );

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(true);
    const ws = useWorkspaceStore.getState();
    expect(ws.isMeasureSelectionInitialized).toBe(true);
    expect(ws.selectedMeasureIds).toEqual(["Levee", "Drainage"]);
    expect(ws.appliedMeasureIds).toEqual(["Levee", "Drainage"]);
  });

  it("does not wipe measure selection between setSelectedCountry/setSelectedHazard during restore (issue #428)", async () => {
    // Seed the store as if measures were already populated to prove that the
    // restore path does NOT clear them via the per-field setters' side-effects.
    getScenarioMock.mockResolvedValue(buildScenarioResponse());
    fetchCostBenefitDataMock.mockResolvedValue(
      buildCostBenefitResponse([{ name: "Levee", cost: 1, benefit: 2, benefit_cost_ratio: 2 }])
    );

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(true);
    // The saved measure survived; the country/hazard transition did not wipe.
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Levee"]);
    expect(useWorkspaceStore.getState().selectedCountry).toBe("egypt");
    expect(useWorkspaceStore.getState().selectedHazard).toBe("flood");
  });

  it("dispatched RUN body after restore carries the saved measures (issue #428 acceptance criterion 4)", async () => {
    // This guards the race: a user restores a scenario and clicks RUN before
    // the Adaptation tab's catalog fetch resolves. The dispatch must still
    // include the saved measure set.
    getScenarioMock.mockResolvedValue(buildScenarioResponse());
    fetchCostBenefitDataMock.mockResolvedValue(
      buildCostBenefitResponse([
        { name: "Levee", cost: 1, benefit: 2, benefit_cost_ratio: 2 },
        { name: "Drainage", cost: 1, benefit: 3, benefit_cost_ratio: 3 },
      ])
    );
    runScenarioMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000, message: "ok" },
        data: { scenarioId: "scn-new", mapTitle: "x" },
      },
    });

    const { result } = renderHook(() => useReportTools());
    await result.current.restoreScenario("scn-7");

    // Now simulate clicking RUN without ever mounting the Adaptation tab.
    const { default: useRunScenario } = await import("../hooks/useRunScenario");
    const { result: runRes } = renderHook(() => useRunScenario());
    await runRes.current.runScenario();

    expect(runScenarioMock).toHaveBeenCalledTimes(1);
    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual(["Levee", "Drainage"]);
  });

  it("returns false and leaves isScenarioRunCompleted unchanged when hydrate-temp fails", async () => {
    getScenarioMock.mockResolvedValue(buildScenarioResponse());
    hydrateScenarioTempMock.mockResolvedValue({
      success: false,
      result: { status: { code: 4000, message: "boom" }, data: null },
    });

    const { result } = renderHook(() => useReportTools());
    const ok = await result.current.restoreScenario("scn-7");

    expect(ok).toBe(false);
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(false);
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
    // Backend returns the pycountry canonical title-case name ("Egypt"); the
    // store everywhere else expects the lowercase slug ("egypt") so the i18n
    // keys and the hazard map's country-coordinates lookup match.
    expect(ws.selectedCountry).toBe("egypt");
    expect(ws.selectedHazard).toBe("flood");
    expect(ws.selectedScenario).toBe("rcp45");
    expect(ws.selectedExposure).toBe("buildings");
    expect(ws.selectedTimeHorizon).toEqual([2020, 2050]);
    expect(ws.selectedAnnualGrowth).toBe(1.5);
    expect(ws.scenarioRunCode).toBe("scn-7");
    expect(ws.selectedScenarioRunCode).toBe("scn-7");
  });

  it("lowercases the Thailand country name on restore", async () => {
    const THAILAND_FIXTURE = [
      {
        id: "scn-8",
        name: "Thailand drought era",
        country: "Thailand",
        hazard_type: "drought",
        tags: null,
        notes: null,
        status: "completed",
        created_at: "2026-04-21T10:00:00Z",
      },
    ];
    getScenarioMock.mockResolvedValue(
      buildScenarioResponse({
        id: "scn-8",
        country: "Thailand",
        hazard_type: "drought",
      })
    );

    render(<WorkspaceView initialScenarios={THAILAND_FIXTURE} />);

    fireEvent.click(screen.getByLabelText("restore-scn-8"));

    await waitFor(() => expect(getScenarioMock).toHaveBeenCalledWith("scn-8"));
    await waitFor(() => expect(useWorkspaceStore.getState().selectedCountry).toBe("thailand"));
  });
});
