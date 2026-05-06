import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import path from "node:path";

// Pin the renderer-facing IPC surface. Adding a channel intentionally
// requires updating this list — it forces a reviewer to consider whether
// the new capability is the minimum required by the renderer (issue #18).
const ALLOWED_INVOKE_CHANNELS = new Set([
  "fetch-temp-dir",
  "fetch-report-dir",
  "fetch-log-dir",
  "clear-temp-dir",
  "is-development-env",
  "save-screenshot",
  "copy-file",
  "copy-folder",
  "open-report",
  "export-pdf",
  "export-workspace",
  "import-workspace",
  "export-scenario",
  "import-scenario",
  "select-custom-data-pack",
  "select-cred-dataset",
  "select-measures-dataset",
  "http:request",
  "http:scenarioRun",
  "http:cancelScenario",
  "updates:check",
  "updates:install-on-next-restart",
  "updates:remind-later",
  "updates:get-status",
  "updates:set-channel",
  "updates:get-release-notes",
  "updates:downgrade",
  "engine:verify-manifest",
  "engine:check-blocked",
  "engine:download-update",
  "offline:get-status",
  "offline:set-enabled",
  "data-packs:get-status",
  "data-packs:rescan",
  "diagnostics:export",
  "diagnostics:get-sentry-status",
  "diagnostics:set-sentry-consent",
]);

const ALLOWED_SEND_CHANNELS = new Set(["shutdown", "minimize", "reload", "log:renderer"]);

const ALLOWED_LISTEN_CHANNELS = new Set([
  "backend-error",
  "progress",
  "save-screenshot-reply",
  "copy-file-reply",
  "copy-folder-reply",
  "update:available",
  "update:downloaded",
  "offline:status-changed",
  "loader:init",
  "loader:status",
]);

const loadPreload = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const preloadPath = path.resolve(here, "..", "..", "public", "preload.js");
  const source = readFileSync(preloadPath, "utf8");

  const exposed = {};
  const ipc = {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  };
  const electronMock = {
    contextBridge: {
      exposeInMainWorld: (key, api) => {
        exposed[key] = api;
      },
    },
    ipcRenderer: ipc,
  };

  const sandbox = {
    require: (name) => {
      if (name === "electron") return electronMock;
      // Anything else is a smell — preload should never pull in fs, path,
      // child_process, or other Node built-ins.
      throw new Error(`preload.js attempted to require disallowed module: ${name}`);
    },
    module: { exports: {} },
    exports: {},
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: preloadPath });
  return { exposed, ipc };
};

describe("preload bridge surface", () => {
  it("exposes only `electron`, `api`, and `logger` on window", () => {
    const { exposed } = loadPreload();
    expect(Object.keys(exposed).sort()).toEqual(["api", "electron", "logger"]);
  });

  it("never requires Node built-ins", () => {
    // Loading would have thrown if a disallowed `require()` ran.
    expect(() => loadPreload()).not.toThrow();
  });

  it("only invokes allowlisted IPC channels", () => {
    const { exposed, ipc } = loadPreload();

    // Drive every exposed function through with dummy args.
    exposed.electron.fetchTempDir();
    exposed.electron.fetchReportDir();
    exposed.electron.clearTempDir();
    exposed.electron.isDevelopmentEnv();
    exposed.electron.saveScreenshot("blob", "/tmp/x.png");
    exposed.electron.copyFile("a", "b");
    exposed.electron.copyFolder("a", "b");
    exposed.electron.openReport("/tmp/r.docx");
    exposed.electron.exportPdf("scenario-id");
    exposed.electron.exportWorkspace();
    exposed.electron.importWorkspace();
    exposed.electron.exportScenario("scenario-id");
    exposed.electron.importScenario();
    exposed.electron.selectCustomDataPack();
    exposed.electron.selectCredDataset();
    exposed.electron.updates.check();
    exposed.electron.updates.installOnNextRestart();
    exposed.electron.updates.remindLater();
    exposed.electron.updates.getStatus();
    exposed.electron.updates.setChannel("beta");
    exposed.electron.updates.getReleaseNotes({ language: "en" });
    exposed.electron.updates.downgrade();
    exposed.electron.engine.verifyManifest();
    exposed.electron.engine.checkBlocked();
    exposed.electron.engine.downloadUpdate();
    exposed.electron.offline.getStatus();
    exposed.electron.offline.setEnabled(true);
    exposed.electron.dataPacks.getStatus();
    exposed.electron.dataPacks.rescan();
    exposed.electron.diagnostics.exportZip();
    exposed.electron.diagnostics.getSentryStatus();
    exposed.electron.diagnostics.setSentryConsent(true);
    exposed.api.http.request("GET", "/", null, "rid");
    exposed.api.http.runScenario({}, "rid");
    exposed.api.http.cancelScenario("job", "rid");

    const invoked = ipc.invoke.mock.calls.map(([channel]) => channel);
    for (const channel of invoked) {
      expect(ALLOWED_INVOKE_CHANNELS.has(channel)).toBe(true);
    }
  });

  it("only sends on allowlisted IPC channels", () => {
    const { exposed, ipc } = loadPreload();

    exposed.electron.shutdown();
    exposed.electron.minimize();
    exposed.electron.reload();
    exposed.logger.log({ level: "info", message: "hi" });

    const sent = ipc.send.mock.calls.map(([channel]) => channel);
    for (const channel of sent) {
      expect(ALLOWED_SEND_CHANNELS.has(channel)).toBe(true);
    }
  });

  it("only subscribes to allowlisted reply/event channels and returns an unsubscribe", () => {
    const { exposed, ipc } = loadPreload();

    const unsubs = [
      exposed.electron.onProgress(() => {}),
      exposed.electron.onSaveScreenshotReply(() => {}),
      exposed.electron.onCopyFileReply(() => {}),
      exposed.electron.onCopyFolderReply(() => {}),
      exposed.electron.onLoaderInit(() => {}),
      exposed.electron.onLoaderStatus(() => {}),
      exposed.electron.updates.onAvailable(() => {}),
      exposed.electron.updates.onDownloaded(() => {}),
      exposed.electron.offline.onStatusChanged(() => {}),
      exposed.api.onBackendError(() => {}),
    ];

    const subscribed = [
      ...ipc.on.mock.calls.map(([channel]) => channel),
      ...ipc.once.mock.calls.map(([channel]) => channel),
    ];
    for (const channel of subscribed) {
      expect(ALLOWED_LISTEN_CHANNELS.has(channel)).toBe(true);
    }

    for (const unsub of unsubs) {
      expect(typeof unsub).toBe("function");
      unsub();
    }
    expect(ipc.removeListener).toHaveBeenCalledTimes(unsubs.length);
  });

  it("does not expose generic `on`, `send`, or `remove` shims", () => {
    const { exposed } = loadPreload();
    expect(exposed.electron).not.toHaveProperty("on");
    expect(exposed.electron).not.toHaveProperty("send");
    expect(exposed.electron).not.toHaveProperty("remove");
  });
});
