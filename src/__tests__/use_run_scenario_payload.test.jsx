// Issue #449: ``selectedMeasureIds`` is always sent as an array.
//
// Before the fix, ``useRunScenario`` omitted the field when the
// Adaptation picker had never been initialized — so a Run from the
// fresh Risk view and an Apply from the Adaptation view produced
// divergent payloads for the same logical selection. The fix is to
// always include the field; ``[]`` means "no filter, run every entity
// measure".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const runScenarioMock = vi.fn();
const fetchImpactFunctionMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    runScenario: (...args) => runScenarioMock(...args),
    fetchImpactFunction: (...args) => fetchImpactFunctionMock(...args),
  },
}));

import useRunScenario from "../hooks/useRunScenario";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";

const ok = () => ({
  success: true,
  result: {
    status: { code: 2000, message: "ok" },
    data: { mapTitle: "x", scenarioId: "scn-new" },
  },
});

beforeEach(() => {
  runScenarioMock.mockReset();
  runScenarioMock.mockResolvedValue(ok());
  fetchImpactFunctionMock.mockReset();
  fetchImpactFunctionMock.mockResolvedValue({
    success: true,
    result: {
      status: { code: 2000, message: "ok" },
      data: {
        id: 50,
        name: "Crops",
        haz_type: "FL",
        exp_type: "Crops",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.5, 1],
        paa: [1, 1, 1],
      },
    },
  });
  useWorkspaceStore.setState({
    selectedCountry: "Thailand",
    selectedHazard: "flood",
    selectedAppOption: "era",
    selectedExposure: "crops",
    selectedExposureCategory: "economic",
    selectedExposureFile: "",
    selectedHazardFile: "",
    selectedScenario: "rcp85",
    selectedTimeHorizon: [2024, 2050],
    selectedAnnualGrowth: 0,
    selectedMeasureIds: [],
    appliedMeasureIds: [],
    isMeasureSelectionInitialized: false,
  });
  useUIStore.setState({});
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("useRunScenario selectedMeasureIds wire format (#449)", () => {
  it("sends an empty array for a fresh Risk-view run (no Adaptation visit yet)", async () => {
    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    expect(runScenarioMock).toHaveBeenCalledTimes(1);
    const body = runScenarioMock.mock.calls[0][0];
    expect(Array.isArray(body.selectedMeasureIds)).toBe(true);
    expect(body.selectedMeasureIds).toEqual([]);
  });

  it("sends an empty array when the Adaptation picker has been initialized with everything unchecked", async () => {
    // Same logical selection ("no measures"), now reached from the
    // Adaptation view's Apply gesture instead of the Risk view's Run.
    // The wire format must be identical.
    useWorkspaceStore.setState({
      selectedMeasureIds: [],
      isMeasureSelectionInitialized: true,
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual([]);
  });

  it("sends the non-empty selection verbatim when measures are picked", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee", "Drainage"],
      isMeasureSelectionInitialized: true,
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual(["Levee", "Drainage"]);
  });

  it("snapshots the current selection so the field is independent of post-dispatch store edits", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee"],
      isMeasureSelectionInitialized: true,
    });

    const { result } = renderHook(() => useRunScenario());
    const pending = result.current.runScenario();
    // Mutate the store after dispatch; the in-flight body must not see it.
    useWorkspaceStore.setState({ selectedMeasureIds: ["Pumps"] });
    await pending;

    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual(["Levee"]);
  });
});

describe("useRunScenario impact-function lookup (#452)", () => {
  it("snapshots the active impact function onto activeRunSummary", async () => {
    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    expect(fetchImpactFunctionMock).toHaveBeenCalledWith("Thailand", "flood", "crops", null);
    const summary = useResultsStore.getState().activeRunSummary;
    expect(summary).not.toBeNull();
    expect(summary.impactFunction?.id).toBe(50);
    expect(summary.impactFunction?.name).toBe("Crops");
    expect(summary.exposure).toBe("crops");
  });

  it("forwards the uploaded entityFile in custom mode", async () => {
    useWorkspaceStore.setState({
      selectedAppOption: "explore",
      selectedExposureFile: "custom.xlsx",
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    expect(fetchImpactFunctionMock).toHaveBeenCalledWith(
      "Thailand",
      "flood",
      "crops",
      "custom.xlsx"
    );
  });

  it("leaves impactFunction null when the lookup fails — non-fatal", async () => {
    fetchImpactFunctionMock.mockResolvedValue({
      success: false,
      error: { code: "x", message: "missing", detail: null, error_id: "e", request_id: "r" },
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    const summary = useResultsStore.getState().activeRunSummary;
    expect(summary.impactFunction).toBeNull();
  });
});
