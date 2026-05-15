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
  scenarioRunSaved: false,
  selectedTimeHorizon: [2024, 2050],
  selectedAnnualGrowth: 0,
  isValidExposure: false,
  isValidHazard: false,

  // Adaptation-measure selection (issue #373, simplified in #451). Values
  // are ``MeasureSpec.name`` — the only stable join key between the catalog
  // and the xlsx-loaded entity measures. The list is the single source of
  // truth for what the next scenario run will include; the MeasuresPanel in
  // the Risk inputs seeds it from the catalog and the global Run button
  // dispatches it. It resets whenever the country, hazard, exposure, or
  // app option changes so a stale selection never rides into the runner for
  // a different entity (issue #448).
  selectedMeasureIds: [],
  // Names of selected measures the backend silently dropped on the most
  // recent run because the entity did not carry them (issue #450). The
  // chart subtitle reads ``length`` to render
  // "Cost-benefit for {applied}/{selected} measures". Reset by the same
  // setters that wipe the measure selection so a stale run's skip list
  // never lingers into a new scenario.
  lastRunSkippedMeasures: [],

  // Fetched view-state shared by the input summary card (left column) and
  // the detail viewer in the middle pane. Owned by the left summary, which
  // is the only fetcher; the middle viewer reads from here. ``null`` means
  // "not loaded yet"; the loaders track in-flight requests so reopening the
  // viewer mid-fetch shows a spinner rather than a stale spec.
  impactFunctionSpec: null,
  impactFunctionError: "",
  impactFunctionLoading: false,
  // Each entry is an entity-derived measure enriched with catalog
  // metadata (display label, built-in flag, source citation); see the
  // backend ``run_fetch_measures`` for the join. The picker is
  // entity-driven so applicability is implicit — every row is something
  // the engine can actually run.
  adaptationMeasures: [],

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
    const { selectedIds, scenarios, pinnedIds } = get();
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return { ok: 0, failed: 0, total: 0, failedIds: [] };
    }
    const results = await Promise.allSettled(ids.map((id) => RiskWiseClient.deleteScenario(id)));
    const succeededIds = [];
    const failedIds = [];
    results.forEach((result, idx) => {
      const id = ids[idx];
      const ok =
        result.status === "fulfilled" &&
        result.value?.success &&
        result.value.result?.status?.code === 2000;
      if (ok) succeededIds.push(id);
      else failedIds.push(id);
    });
    const succeededSet = new Set(succeededIds);
    const nextPinned = pinnedIds.filter((x) => !succeededSet.has(x));
    if (nextPinned.length !== pinnedIds.length) {
      writePinnedIds(nextPinned);
    }
    set({
      scenarios: scenarios.filter((row) => !succeededSet.has(row.id)),
      selectedIds: [],
      pinnedIds: nextPinned,
    });
    return {
      ok: succeededIds.length,
      failed: failedIds.length,
      total: ids.length,
      failedIds,
    };
  },

  setSelectedAppOption: (option) =>
    set({
      selectedAppOption: option,
      selectedMeasureIds: [],
      lastRunSkippedMeasures: [],
    }),
  // One-shot setter for the Workspace ``Restore`` flow. Sets every active-
  // scenario input from a persisted scenario row in a single ``set`` call so
  // the per-field setters' wipe side-effects (``setSelectedCountry`` /
  // ``setSelectedHazard`` clearing ``selectedMeasureIds`` and friends) do not
  // fire. Measure-selection state is left untouched here so the caller can
  // hydrate it from the restored ``cost_benefit_data.json`` blob after this
  // returns (issue #428).
  restoreScenarioInputs: (scenario) => {
    if (!scenario || typeof scenario !== "object") return;
    const country =
      typeof scenario.country === "string" ? scenario.country.toLowerCase() : scenario.country;
    const patch = {
      selectedAppOption: scenario.is_era ? "era" : "custom",
      scenarioRunCode: scenario.id,
      scenarioRunSaved: true,
      selectedScenarioRunCode: scenario.id,
      selectedCountry: country,
      selectedHazard: scenario.hazard_type,
      isValidHazard: true,
      selectedScenario: scenario.scenario,
      selectedTimeHorizon: [scenario.ref_year, scenario.future_year],
      selectedAnnualGrowth: scenario.annual_growth ?? 0,
    };
    if (scenario.exposure_type) {
      patch.selectedExposure = scenario.exposure_type;
      patch.selectedExposureCategory = scenario.asset_type ?? null;
      patch.isValidExposure = true;
    }
    set(patch);
  },
  setSelectedCountry: (country) =>
    set({
      selectedCountry: country,
      selectedMeasureIds: [],
      lastRunSkippedMeasures: [],
    }),
  setSelectedExposure: (exposure) => {
    set({
      selectedExposure: exposure,
      selectedAnnualGrowth: 0,
      selectedMeasureIds: [],
      lastRunSkippedMeasures: [],
    });
  },
  setSelectedExposureCategory: (category) => set({ selectedExposureCategory: category }),
  setSelectedExposureFile: (exposureFile) => set({ selectedExposureFile: exposureFile }),
  setSelectedHazard: (hazard) =>
    set({
      selectedHazard: hazard,
      selectedMeasureIds: [],
      lastRunSkippedMeasures: [],
    }),
  setSelectedHazardFile: (hazardFile) => set({ selectedHazardFile: hazardFile }),
  setSelectedScenario: (scenario) => set({ selectedScenario: scenario }),
  setSelectedScenarioRunCode: (code) => set({ selectedScenarioRunCode: code }),
  setScenarioRunCode: (code = null) => {
    set({ scenarioRunCode: code || generateRunCode(), scenarioRunSaved: false });
  },
  setScenarioRunSaved: (saved) => set({ scenarioRunSaved: Boolean(saved) }),
  setSelectedTimeHorizon: (timeHorizon) => set({ selectedTimeHorizon: timeHorizon }),

  setSelectedMeasureIds: (ids) => {
    const next = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    set({ selectedMeasureIds: next });
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
  setLastRunSkippedMeasures: (names) => {
    const next = Array.isArray(names) ? names.filter((x) => typeof x === "string") : [];
    set({ lastRunSkippedMeasures: next });
  },
  setImpactFunctionSpec: (spec) => set({ impactFunctionSpec: spec }),
  setImpactFunctionError: (message) => set({ impactFunctionError: message || "" }),
  setImpactFunctionLoading: (loading) => set({ impactFunctionLoading: Boolean(loading) }),
  setAdaptationMeasures: (measures) =>
    set({ adaptationMeasures: Array.isArray(measures) ? measures : [] }),
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
