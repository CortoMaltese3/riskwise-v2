import { create } from "zustand";

const useResultsStore = create((set, get) => ({
  isScenarioRunning: false,
  // Lives alongside ``isScenarioRunning`` rather than replacing it because
  // gating decisions (input safety) and chip presentation (UX) are
  // conceptually distinct, and 11 existing consumers read the boolean.
  // Values come from ``src/store/scenarioPhases.js``.
  scenarioPhase: null,
  // Snapshot of the run's inputs captured at dispatch so the chip can show
  // a stable summary even after the user navigates the workspace mid-run.
  // ``landingTab`` is the tab the "View results" link should jump to.
  activeRunSummary: null,
  isScenarioRunCompleted: false,
  isPlotMacroChartRunning: false,
  isPlotMacroChartCompleted: false,

  credOutputData: [],
  credDatasets: [],
  // ``null`` means "use the built-in"; the backend resolves that to the
  // ``is_builtin = TRUE`` row so we never persist the built-in id.
  activeCredDatasetId: null,

  macroEconomicChartData: {},
  macroEconomicChartTitle: "",

  costBenefitData: null,
  isCostBenefitLoading: false,
  costBenefitError: "",

  setIsScenarioRunning: (value) => set({ isScenarioRunning: value }),
  setScenarioPhase: (phase) => set({ scenarioPhase: phase }),
  setActiveRunSummary: (summary) => set({ activeRunSummary: summary }),
  // Merge ``impactFunction`` onto the active summary if it still exists.
  // The IF lookup is async, so this guards against a stale write landing
  // after ``resetScenarioPhase`` has already cleared the summary (issue
  // #452 secondary entry point).
  setActiveRunImpactFunction: (impactFunction) =>
    set((state) =>
      state.activeRunSummary
        ? { activeRunSummary: { ...state.activeRunSummary, impactFunction } }
        : state
    ),
  // Reset both phase and the captured summary together so the chip's "what's
  // running" source of truth doesn't outlive the chip itself.
  resetScenarioPhase: () => set({ scenarioPhase: null, activeRunSummary: null }),
  setIsScenarioRunCompleted: (value) => set({ isScenarioRunCompleted: value }),
  setIsPlotMacroChartRunning: (value) => set({ isPlotMacroChartRunning: value }),
  setIsPlotMacroChartCompleted: (value) => set({ isPlotMacroChartCompleted: value }),

  setCredOutputData: (data) => set({ credOutputData: data }),
  setCredDatasets: (datasets) => set({ credDatasets: datasets }),
  setActiveCredDatasetId: (id) => {
    const next = id || null;
    if (get().activeCredDatasetId === next) return;
    // Clearing ``credOutputData`` forces the next Macroeconomic tab entry to
    // re-fetch against the new dataset — the macro view only reloads when
    // the cached array is empty.
    set({
      activeCredDatasetId: next,
      credOutputData: [],
      macroEconomicChartData: {},
      macroEconomicChartTitle: "",
    });
  },

  setMacroEconomicChartData: (data) => set({ macroEconomicChartData: data }),
  setMacroEconomicChartTitle: (title) => set({ macroEconomicChartTitle: title }),

  beginCostBenefitFetch: () => set({ isCostBenefitLoading: true }),
  endCostBenefitFetch: ({ data = null, error = "" }) =>
    set({
      costBenefitData: data,
      costBenefitError: error,
      isCostBenefitLoading: false,
    }),
}));

export default useResultsStore;
