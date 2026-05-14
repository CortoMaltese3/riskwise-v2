// Regression coverage for issues #448 / #451. Every setter that mutates a
// scenario input (country / hazard / exposure / app option) must wipe
// ``selectedMeasureIds`` so a stale selection never rides into the next
// scenario run for a different entity.

import { beforeEach, describe, expect, it } from "vitest";

import useWorkspaceStore from "../store/useWorkspaceStore";
import { switchAppMode } from "../store/orchestrators";

const seedSelection = () => {
  useWorkspaceStore.setState({
    selectedMeasureIds: ["seawall", "early_warning"],
  });
};

const expectMeasureStateCleared = () => {
  const state = useWorkspaceStore.getState();
  expect(state.selectedMeasureIds).toEqual([]);
};

describe("measure-selection reset triggers", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      selectedAppOption: "era",
      selectedCountry: "thailand",
      selectedHazard: "flood",
      selectedExposure: "economic_assets",
    });
    seedSelection();
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
