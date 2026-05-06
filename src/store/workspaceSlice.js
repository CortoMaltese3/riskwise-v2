import { create } from "zustand";

import RiskWiseClient from "../lib/RiskWiseClient";

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
    // storage may be unavailable (private mode, tests without jsdom storage)
  }
};

const useWorkspaceStore = create((set, get) => ({
  scenarios: [],
  loading: false,
  error: "",
  search: "",
  countryFilter: "",
  hazardFilter: "",
  sortKey: "created_at",
  sortDir: "desc",
  selectedIds: [],
  // Curated pin-set; separate concept from chronological recents. Persisted
  // so the selection survives reloads.
  pinnedIds: readPinnedIds(),
  lastSyncAt: null,

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
}));

export default useWorkspaceStore;
