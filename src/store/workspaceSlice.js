import { create } from "zustand";

import RiskWiseClient from "../lib/RiskWiseClient";

const extractListData = (response) => {
  if (response?.success && response.result?.status?.code === 2000) {
    return { data: response.result.data || [], error: "" };
  }
  return { data: [], error: response?.error?.message || "Failed to load scenarios" };
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

  setScenarios: (scenarios) => set({ scenarios }),

  loadScenarios: async () => {
    set({ loading: true, error: "" });
    try {
      const response = await RiskWiseClient.listScenarios();
      const { data, error } = extractListData(response);
      set({ scenarios: data, error, loading: false });
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
    const { scenarios, selectedIds } = get();
    const previous = scenarios;
    set({
      scenarios: scenarios.filter((row) => row.id !== id),
      selectedIds: selectedIds.filter((x) => x !== id),
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
