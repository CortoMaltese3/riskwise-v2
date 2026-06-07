import { create } from "zustand";

// Phase enum for the auto-update download lifecycle, mirrored by
// UpdateProgressChip. String literals across files invite typo drift, so the
// constant is the typo guard (same pattern as scenarioPhases).
export const UPDATE_PHASES = Object.freeze({
  DOWNLOADING: "downloading",
  READY: "ready",
  FAILED: "failed",
});

const clampPercent = (value) => {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
};

// Drives the update progress chip. The consent dialog kicks a download off
// (`requestUpdateDownload`); the chip renders `phase`/`percent`, advanced by
// `update:download-progress` and `update:downloaded` IPC events.
const useUpdateStore = create((set) => ({
  phase: null, // null | downloading | ready | failed
  version: null,
  percent: 0,
  transferred: 0,
  total: 0,

  startDownloading: (version) =>
    set({
      phase: UPDATE_PHASES.DOWNLOADING,
      version: version ?? null,
      percent: 0,
      transferred: 0,
      total: 0,
    }),
  setProgress: ({ percent, transferred, total } = {}) =>
    set({
      percent: clampPercent(percent),
      transferred: Number(transferred) || 0,
      total: Number(total) || 0,
    }),
  setReady: (version) =>
    set((s) => ({ phase: UPDATE_PHASES.READY, version: version ?? s.version, percent: 100 })),
  setFailed: () => set({ phase: UPDATE_PHASES.FAILED }),
  reset: () => set({ phase: null, version: null, percent: 0, transferred: 0, total: 0 }),
}));

// Start (or retry) the download and arm install-on-quit. Lives here so both
// the consent dialog and the chip's Retry button share one trigger. Errors
// surface as the `failed` phase rather than throwing; the main process owns
// the actual download via `updates:install-on-next-restart`.
export const requestUpdateDownload = async (version) => {
  const store = useUpdateStore.getState();
  store.startDownloading(version);
  try {
    const result = await window.electron?.updates?.installOnNextRestart();
    if (result && result.error) store.setFailed();
  } catch {
    store.setFailed();
  }
};

export default useUpdateStore;
