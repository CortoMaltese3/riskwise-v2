import { describe, it, expect, beforeEach, beforeAll } from "vitest";

let useStore;

beforeAll(async () => {
  ({ default: useStore } = await import("../store"));
});

describe("setSelectedAppOptionWithReset", () => {
  beforeEach(() => {
    // Seed mode-bound fields with non-default values so the reset is observable.
    useStore.setState({
      selectedAppOption: "era",
      selectedExposureFile: "custom.xlsx",
      selectedHazardFile: "custom.h5",
      selectedTimeHorizon: [2030, 2080],
      selectedAnnualGrowth: 7.5,
      isValidExposure: true,
      isValidHazard: true,
      isScenarioRunCompleted: true,
      mapTitle: "stale title",
    });
  });

  it("clears the documented mode-bound fields when the mode actually changes", () => {
    useStore.getState().setSelectedAppOptionWithReset("explore");
    const state = useStore.getState();
    expect(state.selectedAppOption).toBe("explore");
    expect(state.selectedExposureFile).toBe("");
    expect(state.selectedHazardFile).toBe("");
    expect(state.selectedTimeHorizon).toEqual([2024, 2050]);
    expect(state.selectedAnnualGrowth).toBe(0);
    expect(state.isValidExposure).toBe(false);
    expect(state.isValidHazard).toBe(false);
    expect(state.isScenarioRunCompleted).toBe(false);
    expect(state.mapTitle).toBe("");
  });

  it("is a no-op when the new mode equals the current one", () => {
    const before = useStore.getState();
    useStore.getState().setSelectedAppOptionWithReset("era");
    const after = useStore.getState();
    expect(after.selectedAppOption).toBe("era");
    // Every seeded field must survive the no-op call untouched.
    expect(after.selectedExposureFile).toBe(before.selectedExposureFile);
    expect(after.selectedHazardFile).toBe(before.selectedHazardFile);
    expect(after.selectedTimeHorizon).toEqual(before.selectedTimeHorizon);
    expect(after.selectedAnnualGrowth).toBe(before.selectedAnnualGrowth);
    expect(after.isValidExposure).toBe(before.isValidExposure);
    expect(after.isValidHazard).toBe(before.isValidHazard);
    expect(after.isScenarioRunCompleted).toBe(before.isScenarioRunCompleted);
    expect(after.mapTitle).toBe(before.mapTitle);
  });
});
