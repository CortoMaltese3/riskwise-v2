const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  clearTempDir: () => ipcRenderer.invoke("clear-temp-dir"),
  fetchTempDir: () => ipcRenderer.invoke("fetch-temp-dir"),
  fetchReportDir: () => ipcRenderer.invoke("fetch-report-dir"),
  isDevelopmentEnv: () => ipcRenderer.invoke("is-development-env"),
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  remove: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  send: (channel, data) => ipcRenderer.send(channel, data),
  saveScreenshot: (blob, filePath) => ipcRenderer.invoke("save-screenshot", { blob, filePath }),
  onSaveScreenshotReply: (callback) => ipcRenderer.on("save-screenshot-reply", callback),
  copyFile: (sourcePath, destinationPath) =>
    ipcRenderer.invoke("copy-file", { sourcePath, destinationPath }),
  onCopyFileReply: (callback) => ipcRenderer.on("copy-file-reply", callback),
  copyFolder: (sourceFolder, destinationFolder) =>
    ipcRenderer.invoke("copy-folder", { sourceFolder, destinationFolder }),
  onCopyFolderReply: (callback) => ipcRenderer.on("copy-folder-reply", callback),
  openReport: (reportPath) => ipcRenderer.invoke("open-report", reportPath),
});

contextBridge.exposeInMainWorld("api", {
  http: {
    request: async (method, path, body, requestId) =>
      await ipcRenderer.invoke("http:request", { method, path, body, requestId }),
    runScenario: async (body, requestId) =>
      await ipcRenderer.invoke("http:scenarioRun", { body, requestId }),
    cancelScenario: async (jobId, requestId) =>
      await ipcRenderer.invoke("http:cancelScenario", { jobId, requestId }),
  },
  onBackendError: (callback) => {
    const listener = (_event, envelope) => callback(envelope);
    ipcRenderer.on("backend-error", listener);
    return () => ipcRenderer.removeListener("backend-error", listener);
  },
});

// Renderer-side logger bridge: forwards frontend log records to
// electron-log in the main process so a single ``app.log`` has every
// layer's output, keyed by the same request_id.
contextBridge.exposeInMainWorld("logger", {
  log: (record) => ipcRenderer.send("log:renderer", record),
});
