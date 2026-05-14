// Regression coverage for issue #448. Country and hazard setters already
// cleared the adaptation measure-selection trio; exposure and app option
// silently leaked stale selections into the next scenario run. Each setter
// must now wipe `selectedMeasureIds`, `appliedMeasureIds`, and
// `isMeasureSelectionInitialized` so the next picker initialization re-seeds
// from the catalog matching the new entity.

import { beforeEach, describe, expect, it } from "vitest";

import useWorkspaceStore from "../store/useWorkspaceStore";
import { switchAppMode } from "../store/orchestrators";

const seedAppliedSelection = () => {
  useWorkspaceStore.setState({
    selectedMeasureIds: ["seawall", "early_warning"],
    appliedMeasureIds: ["seawall", "early_warning"],
    isMeasureSelectionInitialized: true,
  });
};

const expectMeasureStateCleared = () => {
  const state = useWorkspaceStore.getState();
  expect(state.selectedMeasureIds).toEqual([]);
  expect(state.appliedMeasureIds).toEqual([]);
  expect(state.isMeasureSelectionInitialized).toBe(false);
};

describe("measure-selection reset triggers", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      selectedAppOption: "era",
      selectedCountry: "thailand",
      selectedHazard: "flood",
      selectedExposure: "economic_assets",
    });
    seedAppliedSelection();
  });

  it("clears measure state when the country changes", () => {
    useWorkspaceStore.getState().setSelectedCountry("egypt");
    expectMeasureStateCleared();
  });

  it("clears measure state when the hazard changes", () => {
    useWorkspaceStore.getState().setSelectedHazard("heatwave");
    expectMeasureStateCleared();
  });

  it("clears measure state when the exposure changes", () => {
    useWorkspaceStore.getState().setSelectedExposure("population");
    expectMeasureStateCleared();
  });

  it("clears measure state when the app option changes via the setter", () => {
    useWorkspaceStore.getState().setSelectedAppOption("custom");
    expectMeasureStateCleared();
  });

  it("clears measure state when the app option changes via switchAppMode", () => {
    switchAppMode("custom");
    expectMeasureStateCleared();
  });
});
