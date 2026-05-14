// Issue #449 / #451: ``selectedMeasureIds`` is always sent as an array. The
// Adaptation view's Apply gesture is gone (#451) — the global Run button is
// now the only dispatcher — but the wire-format invariant established in
// #449 still holds: every dispatch carries the field, and ``[]`` means "no
// filter, run every entity measure".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const runScenarioMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    runScenario: (...args) => runScenarioMock(...args),
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
  });
  useUIStore.setState({});
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("useRunScenario selectedMeasureIds wire format (#449 / #451)", () => {
  it("sends an empty array for a fresh Risk-view run (no measure selection seeded)", async () => {
    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    expect(runScenarioMock).toHaveBeenCalledTimes(1);
    const body = runScenarioMock.mock.calls[0][0];
    expect(Array.isArray(body.selectedMeasureIds)).toBe(true);
    expect(body.selectedMeasureIds).toEqual([]);
  });

  it("sends an empty array when the user has explicitly cleared every measure", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: [],
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual([]);
  });

  it("sends the non-empty selection verbatim when measures are picked", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee", "Drainage"],
    });

    const { result } = renderHook(() => useRunScenario());
    await result.current.runScenario();

    const body = runScenarioMock.mock.calls[0][0];
    expect(body.selectedMeasureIds).toEqual(["Levee", "Drainage"]);
  });

  it("snapshots the current selection so the field is independent of post-dispatch store edits", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee"],
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
