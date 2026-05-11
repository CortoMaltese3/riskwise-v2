import { create } from "zustand";

import RiskWiseClient from "../lib/RiskWiseClient";
import { generateRunCode } from "../utils/misc";

const PINNED_STORAGE_KEY = "riskwise.pinnedScenarioIds";

const extractListData = (response) => {
  if (response?.success && response.result?.status?.code === 2000) {
    return { data: response.result.data || [], error: "" };
  }
  return { data: [], error: response?.error?.message || "Failed to load scenarios" };
};

const readPinnedIds = () => {
  try {
    const raw = globalThis.localStorage?.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const writePinnedIds = (ids) => {
  try {
    globalThis.localStorage?.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage may be unavailable
  }
};

const useWorkspaceStore = create((set, get) => ({
  // --- Scenario list (workspace view) ---
  scenarios: [],
  loading: false,
  error: "",
  search: "",
  countryFilter: "",
  hazardFilter: "",
  sortKey: "created_at",
  sortDir: "desc",
  selectedIds: [],
  // Curated pin-set; separate from chronological recents. Persisted so the
  // selection survives reloads.
  pinnedIds: readPinnedIds(),
  lastSyncAt: null,

  // --- Active scenario inputs (single-row domain selection) ---
  // First launch lands on the Risk view with ERA defaults applied. The mode
  // toggle in the TopBar lets users switch to Custom mid-session via a
  // confirm-and-reset flow (see the `switchAppMode` orchestrator).
  selectedAppOption: "era",
  selectedCountry: "",
  selectedExposure: "",
  // `selectedExposureCategory` is "economic" | "non_economic" | null. `null`
  // is reserved for a Custom upload whose category the user hasn't picked.
  selectedExposureCategory: null,
  selectedExposureFile: "",
  selectedHazard: "",
  selectedHazardFile: "",
  selectedScenario: "",
  selectedScenarioRunCode: "",
  scenarioRunCode: "",
  selectedTimeHorizon: [2024, 2050],
  selectedAnnualGrowth: 0,
  isValidExposure: false,
  isValidHazard: false,

  // Adaptation-measure selection (issue #373). ``selectedMeasureIds`` is the
  // user's pending UI selection; ``appliedMeasureIds`` is the set that was
  // last actually sent to the scenario runner. Values are
  // ``MeasureSpec.name`` — the only stable join key between the catalog and
  // the xlsx-loaded entity measures. ``isMeasureSelectionInitialized``
  // distinguishes "picker has never been populated" (run with backend
  // default — every measure) from "user explicitly emptied the picker" (run
  // with ``selectedMeasureIds = []`` so the chart shows the no-measures
  // empty state). All three reset whenever the hazard or country changes.
  selectedMeasureIds: [],
  appliedMeasureIds: [],
  isMeasureSelectionInitialized: false,

  // --- Macro inputs ---
  selectedMacroCountry: "",
  selectedMacroScenario: "",
  selectedMacroSector: "",
  selectedMacroVariable: "",
  available_macro_sectors: [],

  setSearch: (search) => set({ search }),
  setCountryFilter: (countryFilter) => set({ countryFilter }),
  setHazardFilter: (hazardFilter) => set({ hazardFilter }),
  setSort: (sortKey) => {
    const { sortKey: currentKey, sortDir } = get();
    const nextDir = currentKey === sortKey && sortDir === "asc" ? "desc" : "asc";
    set({ sortKey, sortDir: nextDir });
  },

  toggleSelected: (id) => {
    const { selectedIds } = get();
    set({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    });
  },
  setAllSelected: (ids) => set({ selectedIds: ids }),
  clearSelected: () => set({ selectedIds: [] }),

  togglePinned: (id) => {
    if (!id) return;
    const { pinnedIds } = get();
    const next = pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id];
    writePinnedIds(next);
    set({ pinnedIds: next });
  },
  setPinnedIds: (ids) => {
    const next = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    writePinnedIds(next);
    set({ pinnedIds: next });
  },

  setScenarios: (scenarios) => set({ scenarios }),

  loadScenarios: async ({ force = false } = {}) => {
    const { loading, lastSyncAt } = get();
    if (loading) return;
    if (!force && lastSyncAt) return;
    set({ loading: true, error: "" });
    try {
      const response = await RiskWiseClient.listScenarios();
      const { data, error } = extractListData(response);
      set({
        scenarios: data,
        error,
        loading: false,
        lastSyncAt: error ? get().lastSyncAt : new Date().toISOString(),
      });
    } catch (err) {
      set({ error: err?.message || "Failed to load scenarios", loading: false });
    }
  },

  renameScenario: async (id, name) => {
    const { scenarios } = get();
    const previous = scenarios;
    set({
      scenarios: scenarios.map((row) => (row.id === id ? { ...row, name } : row)),
    });
    try {
      const response = await RiskWiseClient.patchScenario(id, { name });
      if (!(response?.success && response.result?.status?.code === 2000)) {
        set({ scenarios: previous, error: response?.error?.message || "Rename failed" });
        return false;
      }
      return true;
    } catch (err) {
      set({ scenarios: previous, error: err?.message || "Rename failed" });
      return false;
    }
  },

  deleteScenario: async (id) => {
    const { scenarios, selectedIds, pinnedIds } = get();
    const previous = scenarios;
    const nextPinned = pinnedIds.filter((x) => x !== id);
    if (nextPinned.length !== pinnedIds.length) {
      writePinnedIds(nextPinned);
    }
    set({
      scenarios: scenarios.filter((row) => row.id !== id),
      selectedIds: selectedIds.filter((x) => x !== id),
      pinnedIds: nextPinned,
    });
    try {
      const response = await RiskWiseClient.deleteScenario(id);
      if (!(response?.success && response.result?.status?.code === 2000)) {
        set({ scenarios: previous, error: response?.error?.message || "Delete failed" });
        return false;
      }
      return true;
    } catch (err) {
      set({ scenarios: previous, error: err?.message || "Delete failed" });
      return false;
    }
  },

  deleteSelected: async () => {
    const { selectedIds, deleteScenario } = get();
    for (const id of selectedIds) {
      await deleteScenario(id);
    }
    set({ selectedIds: [] });
  },

  setSelectedAppOption: (option) => set({ selectedAppOption: option }),
  setSelectedCountry: (country) =>
    set({
      selectedCountry: country,
      selectedMeasureIds: [],
      appliedMeasureIds: [],
      isMeasureSelectionInitialized: false,
    }),
  setSelectedExposure: (exposure) => {
    set({ selectedExposure: exposure, selectedAnnualGrowth: 0 });
  },
  setSelectedExposureCategory: (category) => set({ selectedExposureCategory: category }),
  setSelectedExposureFile: (exposureFile) => set({ selectedExposureFile: exposureFile }),
  setSelectedHazard: (hazard) =>
    set({
      selectedHazard: hazard,
      selectedMeasureIds: [],
      appliedMeasureIds: [],
      isMeasureSelectionInitialized: false,
    }),
  setSelectedHazardFile: (hazardFile) => set({ selectedHazardFile: hazardFile }),
  setSelectedScenario: (scenario) => set({ selectedScenario: scenario }),
  setSelectedScenarioRunCode: (code) => set({ selectedScenarioRunCode: code }),
  setScenarioRunCode: (code = null) => {
    set({ scenarioRunCode: code || generateRunCode() });
  },
  setSelectedTimeHorizon: (timeHorizon) => set({ selectedTimeHorizon: timeHorizon }),

  setSelectedMeasureIds: (ids) => {
    const next = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    set({ selectedMeasureIds: next });
  },
  initializeMeasureSelection: (ids) => {
    // Called by the Adaptation picker once the catalog fetch resolves. Both
    // lists land on the same "every measure selected" value so the Apply
    // button stays disabled until the user actually toggles something.
    const next = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    set({
      selectedMeasureIds: next,
      appliedMeasureIds: next,
      isMeasureSelectionInitialized: true,
    });
  },
  toggleMeasureId: (id) => {
    if (typeof id !== "string") return;
    const { selectedMeasureIds } = get();
    set({
      selectedMeasureIds: selectedMeasureIds.includes(id)
        ? selectedMeasureIds.filter((x) => x !== id)
        : [...selectedMeasureIds, id],
    });
  },
  resetMeasureSelectionToApplied: () => {
    const { appliedMeasureIds } = get();
    set({ selectedMeasureIds: [...appliedMeasureIds] });
  },
  markMeasureSelectionApplied: (ids) => {
    // ``ids`` is the exact list the runner received; storing it (not the
    // current pending selection) keeps applied/selected aligned even if the
    // user toggles something else while the request is in flight.
    const next = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    set({ appliedMeasureIds: next });
  },
  setSelectedAnnualGrowth: (annualGrowth) => set({ selectedAnnualGrowth: annualGrowth }),
  setIsValidExposure: (isValid = null) => {
    const { selectedAppOption } = get();
    if (selectedAppOption === "era") {
      set({ isValidExposure: true });
    } else {
      set({ isValidExposure: isValid });
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

  setSelectedMacroCountry: (country) => {
    set({
      selectedMacroCountry: country,
      selectedMacroScenario: "",
      selectedMacroSector: "",
      selectedMacroVariable: "",
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
}));

export default useWorkspaceStore;
