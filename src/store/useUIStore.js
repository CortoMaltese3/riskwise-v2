import { create } from "zustand";

import { SECTION_IDS } from "../constants/sections";

const SIDEBAR_STORAGE_KEY = "riskwise.sidebarCollapsed";
const SHOW_CHART_VALUES_STORAGE_KEY = "riskwise.showChartValues";
const WALKTHROUGH_STORAGE_KEY = "riskwise.hasSeenWalkthrough";
const TOUR_STATE_STORAGE_KEY = "riskwise.tourState";
const VALID_SECTIONS = new Set(SECTION_IDS);

const readBool = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) === "true";
  } catch {
    return false;
  }
};

const writeBool = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, value ? "true" : "false");
  } catch {
    // storage may be unavailable (private mode, tests without jsdom storage)
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
const initialHasSeenWalkthrough = readBool(WALKTHROUGH_STORAGE_KEY);

const useUIStore = create((set, get) => ({
  // Navigation / chrome
  activeSection: "risk",
  sidebarCollapsed: readBool(SIDEBAR_STORAGE_KEY),
  showChartValues: readBool(SHOW_CHART_VALUES_STORAGE_KEY),

  // Offline mode. Source of truth is electron-store on the main side; the
  // renderer mirrors it via the `electron.offline` IPC bridge.
  // ``offlineTilePort`` stays null until the local MBTiles tile server is up —
  // map components fall back to the remote CDN whenever it is null,
  // regardless of the toggle.
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

  // Map view / refs
  activeMap: "hazard",
  activeMapRef: null,
  activeViewControl: "display_map",
  waterfallChartRef: null,
  costBenefitChartRef: null,
  mapTitle: "",

  // Alerts / errors / progress
  alertMessage: "",
  alertSeverity: "info",
  alertShowMessage: false,
  // Global error surface (issue #12 scenario 6). ``error`` holds the backend
  // envelope (code, detail, error_id); ``errorMessage`` is the user-facing
  // string shown by the toast. Both are cleared together by ``clearError``.
  error: null,
  errorMessage: "",
  modalMessage: "",
  progress: 0,

  // Card / tab selection (UI navigation, not domain selection)
  selectedCard: "country",
  selectedMacroCard: "country",
  selectedTab: 0,
  selectedSubTab: 0,

  // Reports
  reports: [],
  selectedReport: null,
  selectedReportType: "",

  setActiveSection: (section) => {
    if (VALID_SECTIONS.has(section)) set({ activeSection: section });
  },
  setSidebarCollapsed: (collapsed) => {
    writeBool(SIDEBAR_STORAGE_KEY, collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  setShowChartValues: (show) => {
    writeBool(SHOW_CHART_VALUES_STORAGE_KEY, show);
    set({ showChartValues: show });
  },
  toggleShowChartValues: () => {
    const next = !get().showChartValues;
    writeBool(SHOW_CHART_VALUES_STORAGE_KEY, next);
    set({ showChartValues: next });
  },

  // Apply an offline-status payload from the main process. Skips the `set`
  // when no scalar field changed so subscribers don't re-render on every
  // redundant broadcast.
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

  setActiveMap: (map) => set({ activeMap: map }),
  setActiveMapRef: (mapRef) => set({ activeMapRef: mapRef }),
  setActiveViewControl: (control) => set({ activeViewControl: control }),
  setWaterfallChartRef: (chartRef) => set({ waterfallChartRef: chartRef }),
  setCostBenefitChartRef: (chartRef) => set({ costBenefitChartRef: chartRef }),
  setMapTitle: (title) => set({ mapTitle: title }),

  setAlertMessage: (message) => set({ alertMessage: message }),
  setAlertSeverity: (severity) => set({ alertSeverity: severity }),
  setAlertShowMessage: (show) => set({ alertShowMessage: show }),
  setError: (envelope) =>
    set({
      error: envelope,
      errorMessage: envelope ? envelope.message : "",
    }),
  clearError: () => set({ error: null, errorMessage: "" }),
  setModalMessage: (message) => set({ modalMessage: message }),
  setProgress: (newProgress) => set({ progress: newProgress }),

  setSelectedCard: (card) => set({ selectedCard: card }),
  setSelectedMacroCard: (card) => set({ selectedMacroCard: card }),
  setSelectedSubTab: (subTab) => set({ selectedSubTab: subTab }),
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
    set({ selectedTab: tab, selectedSubTab: 0, activeViewControl: viewControl });
  },

  setReports: (reports) => set({ reports }),
  setSelectedReport: (report) => set({ selectedReport: report }),
  setSelectedReportType: (reportType) => set({ selectedReportType: reportType }),
  addReport: (newReport) => {
    const { reports } = get();
    if (!reports.some((r) => r.id === newReport.id)) {
      set((state) => ({ reports: [...state.reports, newReport] }));
    }
  },
  removeReport: (reportId) =>
    set((state) => ({ reports: state.reports.filter((r) => r.id !== reportId) })),
  updateReports: (newReports) => set(() => ({ reports: newReports })),

  setHelpMenuOpen: (open) => set({ helpMenuOpen: open }),
  toggleHelpMenu: () => set((state) => ({ helpMenuOpen: !state.helpMenuOpen })),
  setGlossaryOpen: (open) => set({ glossaryOpen: open }),
  toggleGlossary: () => set((state) => ({ glossaryOpen: !state.glossaryOpen })),
  startWalkthrough: () => set({ walkthroughActive: true, helpMenuOpen: false }),
  finishWalkthrough: () => {
    writeBool(WALKTHROUGH_STORAGE_KEY, true);
    set({ walkthroughActive: false, hasSeenWalkthrough: true });
  },
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

export default useUIStore;
