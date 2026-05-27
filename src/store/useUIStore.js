import { create } from "zustand";

import { SECTION_IDS } from "../constants/sections";
import { TABS, TAB_CONFIG, isValidTab } from "../components/main/tabs";

const SIDEBAR_STORAGE_KEY = "riskwise.sidebarCollapsed";
const WALKTHROUGH_STORAGE_KEY = "riskwise.hasSeenWalkthrough";
const TOUR_STATE_STORAGE_KEY = "riskwise.tourState";
const RESULT_DETAILS_OPEN_KEY = "riskwise.resultDetailsOpen";
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
const initialResultDetailsOpen = readBool(RESULT_DETAILS_OPEN_KEY);

const useUIStore = create((set, get) => ({
  // Navigation / chrome
  activeSection: "home",
  sidebarCollapsed: readBool(SIDEBAR_STORAGE_KEY),

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

  // Basemap selector. Kept in-memory so the preference sticks across
  // map-type switches (Exposure → Hazard → Impact) and re-runs within a
  // session, but resets on app restart.
  basemap: "voyager",

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
  selectedTab: TABS.PARAMETERS,

  // Result-details panel collapse state (#412 C3). Defaults to closed so the
  // multi-line reference copy doesn't crowd the right rail; the user's
  // choice persists across view switches and reloads.
  resultDetailsOpen: initialResultDetailsOpen,

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
  setBasemap: (basemap) => {
    if (get().basemap === basemap) return;
    set({ basemap });
  },
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
  // Backend often re-emits the same step label / progress percentage on
  // consecutive IPC ticks; short-circuit identical values so subscribers
  // don't fan-out for no-ops.
  setModalMessage: (message) => {
    if (get().modalMessage === message) return;
    set({ modalMessage: message });
  },
  setProgress: (newProgress) => {
    if (get().progress === newProgress) return;
    set({ progress: newProgress });
  },

  setSelectedCard: (card) => set({ selectedCard: card }),
  setSelectedMacroCard: (card) => set({ selectedMacroCard: card }),
  setSelectedTab: (tab) => {
    if (!isValidTab(tab)) return;
    // ``defaultView`` per TAB_CONFIG is the source of truth for the
    // ``activeViewControl`` to apply on tab entry. Macro opens on the
    // chart frame so the analyst always sees a chart container; parameter
    // editors open on demand when a side-column card is clicked.
    const viewControl = TAB_CONFIG[tab].defaultView;
    set({ selectedTab: tab, activeViewControl: viewControl });
  },
  // Open the input-parameter editor for whichever card was just selected.
  // From the Risk tab the editor lives in a sibling view-control alongside
  // the map and chart so the controls strip stays mounted; from any other
  // tab it lives on the dedicated Parameters tab.
  openInputEditor: () => {
    if (get().selectedTab === TABS.RISK) {
      set({ activeViewControl: "display_parameters" });
    } else {
      get().setSelectedTab(TABS.PARAMETERS);
    }
  },

  setResultDetailsOpen: (open) => {
    const next = Boolean(open);
    writeBool(RESULT_DETAILS_OPEN_KEY, next);
    set({ resultDetailsOpen: next });
  },
  toggleResultDetails: () => {
    const next = !get().resultDetailsOpen;
    writeBool(RESULT_DETAILS_OPEN_KEY, next);
    set({ resultDetailsOpen: next });
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
