import { create } from "zustand";

const useResultsStore = create((set, get) => ({
  isScenarioRunning: false,
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
