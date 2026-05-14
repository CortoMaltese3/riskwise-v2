import useUIStore from "./useUIStore";
import useResultsStore from "./useResultsStore";
import useWorkspaceStore from "./useWorkspaceStore";

// Cross-store helpers. The setters that previously lived on the monolithic
// store fanned out side effects across several concerns implicitly; these
// helpers express that fan-out as explicit calls so call sites read clearly
// and ownership of each field stays with one store.

export const selectCountry = (country) => {
  useWorkspaceStore.setState({
    selectedCountry: country,
    selectedAnnualGrowth: 0,
    selectedExposure: "",
    selectedExposureCategory: null,
    selectedExposureFile: "",
    selectedHazard: "",
    selectedHazardFile: "",
    selectedScenario: "",
    selectedTimeHorizon: [2024, 2050],
    isValidExposure: false,
    isValidHazard: false,
  });
  useUIStore.setState({ mapTitle: "" });
  useResultsStore.setState({ isScenarioRunCompleted: false });
};

export const selectHazard = (hazard) => {
  useWorkspaceStore.setState({
    selectedAnnualGrowth: 0,
    selectedExposure: "",
    selectedExposureCategory: null,
    selectedExposureFile: "",
    selectedHazard: hazard,
    selectedScenario: "",
    selectedTimeHorizon: [2024, 2050],
    isValidExposure: false,
  });
  useUIStore.setState({ mapTitle: "" });
  useResultsStore.setState({ isScenarioRunCompleted: false });
};

// Switch app mode and atomically reset the inputs and cached scenario results
// that were tied to the previous mode. No-op when the new mode equals the
// current one so a redundant click never destroys user state.
export const switchAppMode = (option) => {
  if (option === useWorkspaceStore.getState().selectedAppOption) return;
  useWorkspaceStore.setState({
    selectedAppOption: option,
    selectedExposureFile: "",
    selectedHazardFile: "",
    selectedTimeHorizon: [2024, 2050],
    selectedAnnualGrowth: 0,
    isValidExposure: false,
    isValidHazard: false,
    selectedMeasureIds: [],
    appliedMeasureIds: [],
    isMeasureSelectionInitialized: false,
  });
  useUIStore.setState({ mapTitle: "" });
  useResultsStore.setState({ isScenarioRunCompleted: false });
};
