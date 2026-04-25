// Preload script — the ONLY bridge between the sandboxed renderer and the
// Node-privileged main process. Each `contextBridge.exposeInMainWorld`
// entry below is a capability granted to any renderer-side code (including
// future XSS), so the channel name is hard-coded per call (never
// renderer-supplied) and Node built-ins are never exposed. The
// `src/__tests__/preload.test.js` allowlist enforces this on every CI run.

const { contextBridge, ipcRenderer, webUtils } = require("electron");

// `once: true` for request/reply RPC channels (one reply per invoke);
// `once: false` for long-lived event streams. Returns an unsubscribe so
// renderer code cannot accumulate listeners or call `removeAllListeners`.
const subscribe = (channel, callback, { once = false } = {}) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer[once ? "once" : "on"](channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("electron", {
  // Window controls (one-way send).
  shutdown: () => ipcRenderer.send("shutdown"),
  minimize: () => ipcRenderer.send("minimize"),
  reload: () => ipcRenderer.send("reload"),

  // Filesystem helpers — main process resolves all paths under userData,
  // never trusts a renderer-supplied absolute path for writes outside the
  // documented temp/report directories.
  fetchTempDir: () => ipcRenderer.invoke("fetch-temp-dir"),
  fetchReportDir: () => ipcRenderer.invoke("fetch-report-dir"),
  clearTempDir: () => ipcRenderer.invoke("clear-temp-dir"),
  isDevelopmentEnv: () => ipcRenderer.invoke("is-development-env"),

  // Report generation: the renderer hands the main process a base64 blob
  // and a destination path; main writes the file with Node fs and replies
  // on the screenshot reply channel.
  saveScreenshot: (blob, filePath) => ipcRenderer.invoke("save-screenshot", { blob, filePath }),
  onSaveScreenshotReply: (callback) => subscribe("save-screenshot-reply", callback, { once: true }),

  copyFile: (sourcePath, destinationPath) =>
    ipcRenderer.invoke("copy-file", { sourcePath, destinationPath }),
  onCopyFileReply: (callback) => subscribe("copy-file-reply", callback, { once: true }),

  copyFolder: (sourceFolder, destinationFolder) =>
    ipcRenderer.invoke("copy-folder", { sourceFolder, destinationFolder }),
  onCopyFolderReply: (callback) => subscribe("copy-folder-reply", callback, { once: true }),

  openReport: (reportPath) => ipcRenderer.invoke("open-report", reportPath),

  exportPdf: (scenarioId) => ipcRenderer.invoke("export-pdf", { scenarioId }),

  // Workspace export/import (issue #82): main process shows the OS save/open
  // dialog and delegates build/merge to the backend. Renderer only triggers
  // the flow and reads back the summary result.
  exportWorkspace: () => ipcRenderer.invoke("export-workspace"),
  importWorkspace: () => ipcRenderer.invoke("import-workspace"),

  // Custom data pack selection (issue #90). The renderer either drops a
  // ZIP (path resolved via ``webUtils.getPathForFile``) or clicks Browse
  // (main process opens a native ``dialog.showOpenDialog``). Validation /
  // import / delete go through the regular ``api.http`` bridge so no extra
  // binary crosses the IPC boundary.
  selectCustomDataPack: () => ipcRenderer.invoke("select-custom-data-pack"),
  selectCredDataset: () => ipcRenderer.invoke("select-cred-dataset"),
  selectMeasuresDataset: () => ipcRenderer.invoke("select-measures-dataset"),
  getPathForFile: (file) => {
    if (!webUtils || typeof webUtils.getPathForFile !== "function") return "";
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },

  // Long-running scenario progress events streamed from the SSE bridge.
  onProgress: (callback) => subscribe("progress", callback),

  // Auto-update bridge (issue #115). `updates.*` drive the consent dialog
  // and Settings panel; `engine.*` drive the signed-manifest engine update
  // flow. All calls go through invoke/`handle` with result envelopes, so a
  // backend error doesn't crash the renderer.
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
    installOnNextRestart: () => ipcRenderer.invoke("updates:install-on-next-restart"),
    remindLater: () => ipcRenderer.invoke("updates:remind-later"),
    getStatus: () => ipcRenderer.invoke("updates:get-status"),
    setChannel: (channel) => ipcRenderer.invoke("updates:set-channel", channel),
    getReleaseNotes: (opts) => ipcRenderer.invoke("updates:get-release-notes", opts),
    downgrade: () => ipcRenderer.invoke("updates:downgrade"),
    onAvailable: (callback) => subscribe("update:available", callback),
    onDownloaded: (callback) => subscribe("update:downloaded", callback),
  },
  engine: {
    verifyManifest: () => ipcRenderer.invoke("engine:verify-manifest"),
    checkBlocked: () => ipcRenderer.invoke("engine:check-blocked"),
    downloadUpdate: () => ipcRenderer.invoke("engine:download-update"),
  },

  // Offline mode (issue #116, Area 14). The Settings panel calls
  // `getStatus`/`setEnabled` to drive the toggle; the AppShell subscribes
  // to `onStatusChanged` so the status-bar indicator and tile-URL
  // switching stay in sync if the toggle flips from another window.
  offline: {
    getStatus: () => ipcRenderer.invoke("offline:get-status"),
    setEnabled: (enabled) => ipcRenderer.invoke("offline:set-enabled", { enabled }),
    onStatusChanged: (callback) => subscribe("offline:status-changed", callback),
  },

  // Signed `.riskwise-pack` data packs (issue #116, Area 14). The main
  // process verifies signatures on startup; the renderer reads the
  // resulting per-pack status and can request a rescan after the user
  // drops new files into `%APPDATA%/RISK WISE/packs/`.
  dataPacks: {
    getStatus: () => ipcRenderer.invoke("data-packs:get-status"),
    rescan: () => ipcRenderer.invoke("data-packs:rescan"),
  },

  // Diagnostics + Sentry consent (issue #119, Area 17). `exportZip` opens
  // a native save dialog and writes a local ZIP (no upload). The Sentry
  // helpers expose the three-gate decision (DSN / consent / offline) so
  // the Settings panel can show "disabled in offline mode" without ever
  // seeing the DSN itself.
  diagnostics: {
    exportZip: () => ipcRenderer.invoke("diagnostics:export"),
    getSentryStatus: () => ipcRenderer.invoke("diagnostics:get-sentry-status"),
    setSentryConsent: (optIn) => ipcRenderer.invoke("diagnostics:set-sentry-consent", { optIn }),
  },
});

contextBridge.exposeInMainWorld("api", {
  http: {
    request: (method, path, body, requestId) =>
      ipcRenderer.invoke("http:request", { method, path, body, requestId }),
    runScenario: (body, requestId) =>
      ipcRenderer.invoke("http:scenarioRun", { body, requestId }),
    cancelScenario: (jobId, requestId) =>
      ipcRenderer.invoke("http:cancelScenario", { jobId, requestId }),
  },
  // Backend supervisor surfaces an `IpcError` envelope when restarts are
  // exhausted; subscribers receive it directly and the returned function
  // detaches the listener.
  onBackendError: (callback) => subscribe("backend-error", callback),
});

// Renderer-side logger bridge: the frontend ``logger.ts`` wrapper sends
// records here; main fans them into electron-log so a single ``app.log``
// has every layer's output, correlated by request_id.
contextBridge.exposeInMainWorld("logger", {
  log: (record) => ipcRenderer.send("log:renderer", record),
});
