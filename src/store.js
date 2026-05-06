import { create } from "zustand";

import { generateRunCode } from "./utils/misc";
import { SECTION_IDS } from "./constants/sections";

const SIDEBAR_STORAGE_KEY = "riskwise.sidebarCollapsed";
const SHOW_CHART_VALUES_STORAGE_KEY = "riskwise.showChartValues";
const WALKTHROUGH_STORAGE_KEY = "riskwise.hasSeenWalkthrough";
const TOUR_STATE_STORAGE_KEY = "riskwise.tourState";
const VALID_SECTIONS = new Set(SECTION_IDS);

const readSidebarCollapsed = () => {
  try {
    return globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeSidebarCollapsed = (value) => {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // storage may be unavailable (private mode, tests without jsdom storage)
  }
};

const readShowChartValues = () => {
  try {
    return globalThis.localStorage?.getItem(SHOW_CHART_VALUES_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeShowChartValues = (value) => {
  try {
    globalThis.localStorage?.setItem(SHOW_CHART_VALUES_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // storage may be unavailable (private mode, tests without jsdom storage)
  }
};

const readHasSeenWalkthrough = () => {
  try {
    return globalThis.localStorage?.getItem(WALKTHROUGH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeHasSeenWalkthrough = (value) => {
  try {
    globalThis.localStorage?.setItem(WALKTHROUGH_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // no-op
  }
};

const readTourState = () => {
  try {
    const raw = globalThis.localStorage?.getItem(TOUR_STATE_STORAGE_KEY);
    if (!raw) return { activeTour: null, tourStep: 0 };
    const parsed = JSON.parse(raw);
    return {
      activeTour: typeof parsed?.activeTour === "string" ? parsed.activeTour : null,
      tourStep: Number.isInteger(parsed?.tourStep) ? parsed.tourStep : 0,
    };
  } catch {
    return { activeTour: null, tourStep: 0 };
  }
};

const writeTourState = (activeTour, tourStep) => {
  try {
    globalThis.localStorage?.setItem(
      TOUR_STATE_STORAGE_KEY,
      JSON.stringify({ activeTour, tourStep })
    );
  } catch {
    // no-op
  }
};

const initialTourState = readTourState();
const initialHasSeenWalkthrough = readHasSeenWalkthrough();

const useStore = create((set, get) => ({
  // The app always lands on Home after the mode-selection dialog (NavigateAlert)
  // — both for first-run and returning users. The dialog is shown on every
  // app start because `selectedAppOption` is intentionally not persisted.
  activeSection: "home",
  sidebarCollapsed: readSidebarCollapsed(),
  showChartValues: readShowChartValues(),
  // Offline mode. Source of truth is electron-store on the main side;
  // the renderer mirrors it via the `electron.offline` IPC bridge.
  // ``offlineTilePort`` stays null until the local MBTiles tile server
  // is up — map components fall back to the remote CDN whenever it is
  // null, regardless of the toggle.
  offlineMode: false,
  offlineTilePort: null,
  offlineTilesPath: null,
  offlineImportedPacks: [],
  // Onboarding / guided-tour state. ``hasSeenWalkthrough`` is the only
  // persisted first-run flag; ``activeTour``/``tourStep`` are persisted so a
  // guided tour survives accidental reloads (resumable, per issue #88).
  hasSeenWalkthrough: initialHasSeenWalkthrough,
  walkthroughActive: !initialHasSeenWalkthrough,
  helpMenuOpen: false,
  glossaryOpen: false,
  activeTour: initialTourState.activeTour,
  tourStep: initialTourState.tourStep,
  activeMap: "hazard",
  activeMapRef: null,
  activeViewControl: "display_map",
  available_macro_sectors: [],
  alertMessage: "",
  alertSeverity: "info",
  alertShowMessage: false,
  credOutputData: [],
  credDatasets: [],
  // ``null`` means "use the built-in"; the backend resolves that to the
  // ``is_builtin = TRUE`` row so we never persist the built-in id.
  activeCredDatasetId: null,
  // Global error surface (issue #12 scenario 6). ``error`` holds the backend
  // envelope (code, detail, error_id); ``errorMessage`` is the user-facing
  // string shown by the toast. Both are cleared together by ``clearError``.
  error: null,
  errorMessage: "",
  isPlotMacroChartCompleted: false,
  isPlotMacroChartRunning: false,
  isScenarioRunCompleted: false,
  isScenarioRunning: false,
  isValidExposureEconomic: false,
  isValidExposureNonEconomic: false,
  isValidHazard: false,
  mapTitle: "",
  macroEconomicChartData: {},
  macroEconomicChartTitle: "",
  modalMessage: "",
  progress: 0,
  reports: [],
  scenarioRunCode: "",
  selectedAnnualGrowth: 0,
  selectedAppOption: "",
  selectedCard: "country",
  selectedCountry: "",
  selectedExposureEconomic: "",
  selectedExposureFile: "",
  selectedExposureNonEconomic: "",
  selectedHazard: "",
  selectedHazardFile: "",
  selectedMacroCard: "country",
  selectedMacroCountry: "",
  selectedMacroScenario: "",
  selectedMacroSector: "",
  selectedMacroVariable: "",
  selectedReport: null,
  selectedReportType: "",
  selectedScenario: "",
  selectedScenarioRunCode: "",
  selectedSubTab: 0,
  selectedTab: 0,
  selectedTimeHorizon: [2024, 2050],
  waterfallChartRef: null,
  costBenefitChartRef: null,

  // Method to add a new report
  addReport: (newReport) => {
    const { reports } = get();
    // Check if the report already exists
    const reportExists = reports.some((r) => r.id === newReport.id);
    if (!reportExists) {
      set((state) => ({
        reports: [...state.reports, newReport],
      }));
    }
  },

  // Method to remove a report by id
  removeReport: (reportId) =>
    set((state) => ({
      reports: state.reports.filter((report) => report.id !== reportId),
    })),

  // Method to update reports
  updateReports: (newReports) =>
    set(() => ({
      reports: newReports,
    })),

  // Apply an offline-status payload from the main process. Skips the
  // `set` when no scalar field changed so subscribers don't re-render
  // on every redundant broadcast (the main side broadcasts on each
  // toggle / rescan even when the new payload is identical).
  applyOfflineStatus: (status) => {
    if (!status || typeof status !== "object") return;
    const next = {
      offlineMode: Boolean(status.enabled),
      offlineTilePort: status.tilePort ?? null,
      offlineTilesPath: status.tilesPath ?? null,
      offlineImportedPacks: Array.isArray(status.importedPacks) ? status.importedPacks : [],
    };
    const prev = get();
    const packsChanged =
      prev.offlineImportedPacks.length !== next.offlineImportedPacks.length ||
      prev.offlineImportedPacks.some((p, i) => p !== next.offlineImportedPacks[i]);
    if (
      prev.offlineMode === next.offlineMode &&
      prev.offlineTilePort === next.offlineTilePort &&
      prev.offlineTilesPath === next.offlineTilesPath &&
      !packsChanged
    ) {
      return;
    }
    set(next);
  },

  setActiveSection: (section) => {
    if (VALID_SECTIONS.has(section)) set({ activeSection: section });
  },
  setSidebarCollapsed: (collapsed) => {
    writeSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  setShowChartValues: (show) => {
    writeShowChartValues(show);
    set({ showChartValues: show });
  },
  toggleShowChartValues: () => {
    const next = !get().showChartValues;
    writeShowChartValues(next);
    set({ showChartValues: next });
  },
  setActiveMap: (map) => set({ activeMap: map }),
  setActiveMapRef: (mapRef) => set({ activeMapRef: mapRef }),
  setWaterfallChartRef: (chartRef) => set({ waterfallChartRef: chartRef }),
  setCostBenefitChartRef: (chartRef) => set({ costBenefitChartRef: chartRef }),
  setAlertMessage: (message) => set({ alertMessage: message }),
  setAlertSeverity: (severity) => set({ alertSeverity: severity }),
  setAlertShowMessage: (show) => set({ alertShowMessage: show }),
  setCredOutputData: (data) => set({ credOutputData: data }),
  setCredDatasets: (datasets) => set({ credDatasets: datasets }),
  setActiveCredDatasetId: (id) => {
    const next = id || null;
    if (get().activeCredDatasetId === next) return;
    // Clearing ``credOutputData`` forces the next Macroeconomic tab entry
    // to re-fetch against the new dataset — MainTabs only reloads when the
    // cached array is empty.
    set({
      activeCredDatasetId: next,
      credOutputData: [],
      macroEconomicChartData: {},
      macroEconomicChartTitle: "",
    });
  },
  setError: (envelope) =>
    set({
      error: envelope,
      errorMessage: envelope ? envelope.message : "",
    }),
  clearError: () => set({ error: null, errorMessage: "" }),
  setIsPlotMacroChartCompleted: (data) => set({ isPlotMacroChartCompleted: data }),
  setIsPlotMacroChartRunning: (data) => set({ isPlotMacroChartRunning: data }),
  setIsScenarioRunCompleted: (data) => set({ isScenarioRunCompleted: data }),
  setIsScenarioRunning: (data) => set({ isScenarioRunning: data }),
  setIsValidExposureEconomic: (isValid = null) => {
    const { selectedAppOption } = get();
    if (selectedAppOption === "era") {
      set({ isValidExposureEconomic: true });
    } else {
      set({ isValidExposureEconomic: isValid });
    }
  },
  setIsValidExposureNonEconomic: (isValid = null) => {
    const { selectedAppOption } = get();
    if (selectedAppOption === "era") {
      set({ isValidExposureNonEconomic: true });
    } else {
      set({ isValidExposureNonEconomic: isValid });
    }
  },
  setIsValidHazard: (isValid = null) => {
    const { selectedAppOption } = get();
    if (selectedAppOption === "era") {
      set({ isValidHazard: true });
    } else {
      set({ isValidHazard: isValid });
    }
  },
  setMapTitle: (data) => set({ mapTitle: data }),
  setMacroEconomicChartData: (data) => set({ macroEconomicChartData: data }),
  setMacroEconomicChartTitle: (title) => set({ macroEconomicChartTitle: title }),
  setModalMessage: (message) => set({ modalMessage: message }),
  setProgress: (newProgress) => set({ progress: newProgress }),
  setReports: (reports) => set({ reports }),
  setScenarioRunCode: (code = null) => {
    set({ scenarioRunCode: code || generateRunCode() });
  },
  setSelectedAnnualGrowth: (annualGrowth) => set({ selectedAnnualGrowth: annualGrowth }),
  setSelectedAppOption: (option) => set({ selectedAppOption: option }),
  setSelectedCard: (card) => set({ selectedCard: card }),
  setSelectedCountry: (country) => {
    set({
      selectedCountry: country,
      selectedAnnualGrowth: 0,
      selectedExposureEconomic: "",
      selectedExposureFile: "",
      selectedExposureNonEconomic: "",
      selectedHazard: "",
      selectedHazardFile: "",
      selectedScenario: "",
      selectedTimeHorizon: [2024, 2050],
      isValidExposureEconomic: false,
      isValidExposureNonEconomic: false,
      isValidHazard: false,
      mapTitle: "",
      isScenarioRunCompleted: false,
    });
  },
  setSelectedMacroCard: (card) => set({ selectedMacroCard: card }),
  setSelectedMacroCountry: (country) => {
    set({
      selectedMacroCountry: country,
      selectedMacroScenario: "",
      selectedMacroSector: "",
      selectedMacroVariable: "",
    });
  },
  setSelectedExposureEconomic: (exposureEconomic) => {
    set({ selectedExposureEconomic: exposureEconomic, selectedAnnualGrowth: 0 });
  },
  setSelectedExposureNonEconomic: (exposureNonEconomic) => {
    set({ selectedExposureNonEconomic: exposureNonEconomic, selectedAnnualGrowth: 0 });
  },
  setSelectedHazard: (hazard) => {
    set({
      selectedAnnualGrowth: 0,
      selectedExposureEconomic: "",
      selectedExposureFile: "",
      selectedExposureNonEconomic: "",
      selectedHazard: hazard,
      selectedScenario: "",
      selectedTimeHorizon: [2024, 2050],
      isValidExposureEconomic: false,
      isValidExposureNonEconomic: false,
      mapTitle: "",
      isScenarioRunCompleted: false,
    });
  },
  setSelectedMacroScenario: (scenario) =>
    set({
      selectedMacroScenario: scenario,
      selectedMacroVariable: "",
      selectedMacroSector: "",
    }),
  setSelectedMacroSector: (sector) => set({ selectedMacroSector: sector }),
  setSelectedMacroVariable: (variable) =>
    set({
      selectedMacroVariable: variable,
      selectedMacroSector: "",
    }),
  setSelectedExposureFile: (exposureFile) => set({ selectedExposureFile: exposureFile }),
  setSelectedHazardFile: (hazardFile) => set({ selectedHazardFile: hazardFile }),
  setSelectedReportType: (reportType) => set({ selectedReportType: reportType }),
  setSelectedScenario: (scenario) => set({ selectedScenario: scenario }),
  setSelectedScenarioRunCode: (code) => set({ selectedScenarioRunCode: code }),
  setSelectedSubTab: (subTab) => set({ selectedSubTab: subTab }),
  setSelectedReport: (report) => set({ selectedReport: report }),
  setSelectedTab: (tab) => {
    let viewControl = "";
    if (tab === 1) {
      viewControl = "display_map";
    } else if (tab === 2) {
      // Macro tab opens on the chart frame so the analyst always sees a
      // chart container; parameter editors open on demand when a
      // side-column card is clicked.
      viewControl = "display_macro_chart";
    }

    set({
      selectedTab: tab,
      selectedSubTab: 0,
      activeViewControl: viewControl,
    });
  },

  setSelectedTimeHorizon: (timeHorizon) => set({ selectedTimeHorizon: timeHorizon }),
  setActiveViewControl: (control) => set({ activeViewControl: control }),

  startWalkthrough: () => set({ walkthroughActive: true, helpMenuOpen: false }),
  finishWalkthrough: () => {
    writeHasSeenWalkthrough(true);
    set({ walkthroughActive: false, hasSeenWalkthrough: true });
  },
  setHelpMenuOpen: (open) => set({ helpMenuOpen: open }),
  toggleHelpMenu: () => set((state) => ({ helpMenuOpen: !state.helpMenuOpen })),
  setGlossaryOpen: (open) => set({ glossaryOpen: open }),
  toggleGlossary: () => set((state) => ({ glossaryOpen: !state.glossaryOpen })),
  startTour: (tourId) => {
    writeTourState(tourId, 0);
    set({ activeTour: tourId, tourStep: 0, helpMenuOpen: false });
  },
  setTourStep: (step) => {
    const nextStep = Math.max(0, step);
    writeTourState(get().activeTour, nextStep);
    set({ tourStep: nextStep });
  },
  endTour: () => {
    writeTourState(null, 0);
    set({ activeTour: null, tourStep: 0 });
  },
}));

export default useStore;
