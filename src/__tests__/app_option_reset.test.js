import { describe, it, expect, beforeEach, beforeAll } from "vitest";

let useUIStore;
let useResultsStore;
let useWorkspaceStore;
let switchAppMode;

beforeAll(async () => {
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
  ({ switchAppMode } = await import("../store/orchestrators"));
});

describe("switchAppMode orchestrator", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      selectedAppOption: "era",
      selectedExposureFile: "custom.xlsx",
      selectedHazardFile: "custom.h5",
      selectedTimeHorizon: [2030, 2080],
      selectedAnnualGrowth: 7.5,
      isValidExposure: true,
      isValidHazard: true,
    });
    useResultsStore.setState({ isScenarioRunCompleted: true });
    useUIStore.setState({ mapTitle: "stale title" });
  });

  it("clears the documented mode-bound fields when the mode actually changes", () => {
    switchAppMode("explore");
    const ws = useWorkspaceStore.getState();
    expect(ws.selectedAppOption).toBe("explore");
    expect(ws.selectedExposureFile).toBe("");
    expect(ws.selectedHazardFile).toBe("");
    expect(ws.selectedTimeHorizon).toEqual([2024, 2050]);
    expect(ws.selectedAnnualGrowth).toBe(0);
    expect(ws.isValidExposure).toBe(false);
    expect(ws.isValidHazard).toBe(false);
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(false);
    expect(useUIStore.getState().mapTitle).toBe("");
  });

  it("is a no-op when the new mode equals the current one", () => {
    const wsBefore = useWorkspaceStore.getState();
    const uiBefore = useUIStore.getState();
    const resBefore = useResultsStore.getState();
    switchAppMode("era");
    const wsAfter = useWorkspaceStore.getState();
    expect(wsAfter.selectedAppOption).toBe("era");
    expect(wsAfter.selectedExposureFile).toBe(wsBefore.selectedExposureFile);
    expect(wsAfter.selectedHazardFile).toBe(wsBefore.selectedHazardFile);
    expect(wsAfter.selectedTimeHorizon).toEqual(wsBefore.selectedTimeHorizon);
    expect(wsAfter.selectedAnnualGrowth).toBe(wsBefore.selectedAnnualGrowth);
    expect(wsAfter.isValidExposure).toBe(wsBefore.isValidExposure);
    expect(wsAfter.isValidHazard).toBe(wsBefore.isValidHazard);
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(
      resBefore.isScenarioRunCompleted
    );
    expect(useUIStore.getState().mapTitle).toBe(uiBefore.mapTitle);
  });
});
