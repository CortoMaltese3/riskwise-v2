const { app, BrowserWindow, ipcMain, net, protocol, session, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("node:crypto");
const log = require("electron-log");
const Store = require("electron-store");
const {
  isEngineVersionCompatible,
  resolveReleaseChannel,
  verifyEngineManifest,
} = require("./engineManifest");
const { scanAndImportPacks } = require("./dataPacks");
const { startTileServer } = require("./tileServer");
const { TILES_FILENAME } = require("./offlineConstants");
const { buildDiagnosticsZip, sanitizeScenarioRow } = require("./diagnostics");
const os = require("node:os");

global.pythonProcess = null;

// `connect-src` is locked to loopback (any port — supervisor picks an
// ephemeral one) so a renderer XSS cannot exfiltrate to arbitrary hosts.
// `style-src 'unsafe-inline'` is required by MUI/Emotion's runtime style
// injection; `script-src 'self'` is the actual XSS-to-RCE gate. Keep in
// sync with the meta tag in `index.html`.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // `127.0.0.1:*` is allowed for the offline-mode MBTiles tile server,
  // which serves PNG tiles from a loopback ephemeral port (see
  // `tileServer.js`). Keep in sync with the meta tag in `index.html`.
  "img-src 'self' data: blob: file: http://127.0.0.1:* https://*.basemaps.cartocdn.com",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* file:",
  "worker-src 'self' blob:",
].join("; ");
const CSP_HEADER = [CSP_DIRECTIVES];

// Baseline `webPreferences` for every BrowserWindow. `nodeIntegration` is
// false so renderer libs run in a real browser environment (Vite/ESM
// otherwise breaks on use-sync-external-store's CommonJS require of React).
const HARDENED_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  webviewTag: false,
});

// 7-day retention for the daily-rotated Electron main log. Older files are
// purged when rotation promotes the active file.
const LOG_RETENTION_DAYS = 7;
const LOG_FILENAME_PREFIX = "app";

const basePath = app.getAppPath();
let mainWindow;
let loaderWindow;
let userLogDir;
let userDataDir;
let backendBaseUrl = null;

// Supervisor state (issue #12, scenario 1). A single-shot poll pings /health
// every HEALTH_POLL_INTERVAL_MS. On failure we attempt up to
// MAX_RESTART_ATTEMPTS restarts with exponential-backoff delays of
// 1 s → 2 s → 4 s before giving up and surfacing a structured
// ``backend-error`` IPC to the renderer.
const HEALTH_POLL_INTERVAL_MS = 10000;
const MAX_RESTART_ATTEMPTS = 3;
let healthPollTimer = null;
let supervisorBusy = false;

// Auto-update configuration (issue #115, Area 13).
//
// `electron-updater` checks GitHub Releases on a timer; the renderer drives
// the consent UX so the dialog matches the rest of the app (native
// `showMessageBox` is intentionally avoided after Phase 4). State that must
// survive restarts — snooze timestamps, channel preference, release-notes
// cache — lives in `electron-store`, which writes JSON under `userData`
// separate from `riskwise.db` so the app DB stays purely a scenario store.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const REMIND_SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RELEASE_NOTES_CACHE_MS = 60 * 60 * 1000; // 1 hour
const RELEASE_OWNER = "CortoMaltese3";
const RELEASE_REPO = "riskwise-v2";
const ENGINE_MANIFEST_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest/download/engine-manifest.json`;
const GITHUB_RELEASE_API = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases`;
const ENGINE_PUB_KEY_FILENAME = "engine-manifest.pub";

let updateCheckTimer = null;
let updateStore = null;
let releaseChannel = "stable";
// In-memory cache keyed by tag. Persisting to disk isn't worth the risk of
// shipping stale release notes after a bad write — 1 h in-memory TTL is
// enough to survive panel re-mounts and window reloads.
const releaseNotesCache = new Map();

const isDevelopmentEnv = () => {
  return !app.isPackaged;
};

// electron-log's `archiveLogFn` runs whenever `maxSize` is exceeded; we
// also call `pruneOldLogs` directly at startup so files left behind from a
// previous run can't accumulate past the retention window if the user
// never rolls a large enough log mid-session.
const configureLogRotation = (logInstance, logDir) => {
  const dateStamp = () => new Date().toISOString().slice(0, 10);
  logInstance.transports.file.resolvePathFn = () =>
    path.join(logDir, `${LOG_FILENAME_PREFIX}-${dateStamp()}.log`);
  // Keep per-file size bounded so a single day can't swallow the window;
  // electron-log calls archiveLogFn when a file crosses this threshold.
  logInstance.transports.file.maxSize = 5 * 1024 * 1024;
  logInstance.transports.file.archiveLogFn = (oldLog) => {
    try {
      const archiveName = path.join(
        logDir,
        `${LOG_FILENAME_PREFIX}-${dateStamp()}-${Date.now()}.log`,
      );
      fs.renameSync(oldLog.toString(), archiveName);
    } catch (err) {
      logInstance.warn("[electron] failed to archive old log:", err.message);
    }
    pruneOldLogs(logDir);
  };
  pruneOldLogs(logDir);
};

const pruneOldLogs = (logDir) => {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const entries = fs.readdirSync(logDir);
    for (const entry of entries) {
      if (!entry.startsWith(`${LOG_FILENAME_PREFIX}-`) || !entry.endsWith(".log")) continue;
      const full = path.join(logDir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(full);
        }
      } catch {
        // Skip files we can't stat/unlink (e.g., actively-open current log
        // on Windows); next startup will retry.
      }
    }
  } catch {
    // Directory might not exist yet on very first run.
  }
};

const cleanupPython = () => {
  if (global.pythonProcess && !global.pythonProcess.killed) {
    try {
      global.pythonProcess.kill();
      log.info("[electron] Python process terminated in cleanup");
    } catch (error) {
      log.error("[electron] error killing Python process in cleanup:", error);
    }
  }
  global.pythonProcess = null;
};

// Register `app://` as a privileged scheme so the renderer gets a real origin
// (not `null`) when loaded from `file://` with webSecurity enabled. Must be
// called before `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
    // If second instance is instantiated, the app focuses on the current window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Removed: avoid forcing GPU flags unless strictly needed.
// app.commandLine.appendSwitch("in-process-gpu");
if (app.getGPUFeatureStatus().gpu_compositing.includes("disabled")) {
  app.disableHardwareAcceleration();
}

const updateLoaderMessage = (message) => {
  if (loaderWindow && !loaderWindow.isDestroyed()) {
    loaderWindow.webContents.executeJavaScript(`
      document.body.innerHTML = \`
        <div style="text-align: center; color: white; font-family: Arial, sans-serif;">
          <img src="gear-loader.svg" alt="loading..." style="width: 60px; height: 60px; margin-bottom: 12px;">
          <h3 style="margin: 0 0 6px 0; font-size: 15px;">Starting RISK WISE</h3>
          <p style="margin: 0; font-size: 12px;">${message}</p>
        </div>
      \`;
    `);
  }
};

const downloadAndInstallEngine = async (loaderWindow) => {
  const engineRoot = process.env.LOCALAPPDATA;
  if (!engineRoot) {
    throw new Error("Failed to resolve LOCALAPPDATA environment variable");
  }

  const enginePath = path.join(engineRoot, "RiskWiseEngine");
  const pythonExecutable = path.join(enginePath, "python.exe");
  const archivePath = path.join(engineRoot, "RiskWiseEngine.zip");

  // Check if already installed
  if (fs.existsSync(pythonExecutable)) {
    log.info("[electron] Python engine already installed at:", enginePath);
    return pythonExecutable;
  }

  log.info("[electron] Python engine not found, downloading...");
  log.info("[electron] Archive will be downloaded to:", archivePath);

  try {
    updateLoaderMessage("RISK WISE Engine is missing. Fetching manifest...");

    // Engine URL is driven by the signed engine-manifest.json (D15) — no
    // hardcoded fallback. `fetchVerifiedEngineManifest` verifies the
    // minisign signature before we trust any field inside.
    const manifest = await fetchVerifiedEngineManifest();
    const engineUrl = manifest.download_url;
    log.info(`[electron] Engine manifest resolved version=${manifest.version} url=${engineUrl}`);
    updateLoaderMessage("Downloading RISK WISE Engine...");

    await new Promise((resolve, reject) => {
      const request = net.request(engineUrl);
      const file = fs.createWriteStream(archivePath);

      request.on("response", (response) => {
        const totalBytes = parseInt(response.headers["content-length"], 10);
        let downloadedBytes = 0;

        log.info(`[electron] Starting download, size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          file.write(chunk);

          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);

          // Update UI every 10%
          if (
            Math.floor(percent / 10) >
            Math.floor((((downloadedBytes - chunk.length) / totalBytes) * 100) / 10)
          ) {
            updateLoaderMessage(`Downloading engine... ${percent}%`);
            log.info(`[electron] Downloaded: ${percent}%`);
          }
        });

        response.on("end", () => {
          file.end();
          file.close();
          log.info("[electron] Download complete, file size:", fs.statSync(archivePath).size);
          resolve();
        });

        response.on("error", (err) => {
          file.close();
          if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
          }
          reject(err);
        });
      });

      request.on("error", (err) => {
        file.close();
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
        reject(err);
      });

      request.end();
    });

    // Verify download
    if (!fs.existsSync(archivePath)) {
      throw new Error("Archive file not found after download");
    }

    const archiveSize = fs.statSync(archivePath).size;
    log.info(`[electron] Archive downloaded: ${(archiveSize / 1024 / 1024).toFixed(2)} MB`);

    if (archiveSize < 10 * 1024 * 1024) {
      throw new Error(
        `Archive too small (${(archiveSize / 1024 / 1024).toFixed(2)} MB) - download failed`
      );
    }

    updateLoaderMessage("Extracting engine files...");
    log.info("[electron] Starting extraction...");

    // Extract archive
    const { execSync } = require("child_process");

    // Clean and create engine directory
    if (fs.existsSync(enginePath)) {
      log.info("[electron] Removing existing engine directory");
      fs.rmSync(enginePath, { recursive: true, force: true });
    }
    fs.mkdirSync(enginePath, { recursive: true });

    // Extract using tar
    log.info("[electron] Extracting to:", enginePath);
    const extractCmd = `tar -xf "${archivePath}" -C "${enginePath}"`;

    execSync(extractCmd, { stdio: "pipe" });

    // Check extracted contents
    const extracted = fs.readdirSync(enginePath);
    log.info("[electron] Extracted top-level items:", extracted);

    // If archive contains a single directory, flatten structure
    if (extracted.length === 1 && fs.statSync(path.join(enginePath, extracted[0])).isDirectory()) {
      const subDir = path.join(enginePath, extracted[0]);
      log.info("[electron] Flattening nested directory:", subDir);

      const items = fs.readdirSync(subDir);

      for (const item of items) {
        const srcPath = path.join(subDir, item);
        const destPath = path.join(enginePath, item);
        fs.renameSync(srcPath, destPath);
      }

      fs.rmdirSync(subDir);
      log.info("[electron] Structure flattened");
    }

    // Clean up archive
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
      log.info("[electron] Cleaned up archive file");
    }

    // Verify installation
    if (!fs.existsSync(pythonExecutable)) {
      const contents = fs.readdirSync(enginePath).slice(0, 10);
      log.error("[electron] python.exe not found. Directory contains:", contents);
      throw new Error(`Installation incomplete - python.exe not found at: ${pythonExecutable}`);
    }

    updateLoaderMessage("Engine installed successfully!");
    log.info("[electron] Python engine installed successfully");

    return pythonExecutable;
  } catch (error) {
    log.error("[electron] Failed to download/install Python engine:", error);

    dialog.showErrorBox(
      "Installation Error",
      `Failed to install RISK WISE engine.\n\nError: ${error.message}\n\nPlease check:\n- Internet connection\n- Available disk space (~2 GB)\n- Antivirus not blocking download\n\nLogs: ${userLogDir}`
    );

    throw error;
  }
};

// Renderer security defense-in-depth: refuse the renderer's webContents the
// ability to spawn new windows, navigate off-app, or attach <webview> tags.
// `webPreferences` already locks down each new BrowserWindow we create, but
// this layer catches anything Electron auto-instantiates.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      shell.openExternal(url).catch((err) =>
        log.error("[electron] shell.openExternal failed:", err.message),
      );
    }
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("app://")) {
      event.preventDefault();
      log.warn("[electron] blocked navigation to:", url);
    }
  });

  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
    log.warn("[electron] blocked <webview> attach attempt");
  });
});

app.whenReady().then(async () => {
  // Inject CSP at the network layer for every response served to the
  // default session (loader + main window). Done before the first
  // BrowserWindow loads so no early request escapes the policy.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": CSP_HEADER,
      },
    });
  });

  // Block permission requests (camera, microphone, geolocation, etc.) — the
  // app does not need any of them, so deny by default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, deny) => deny(false));

  // Serve the renderer build under `app://./` so it loads with a stable,
  // non-null origin. This avoids the CORS null-origin block that Chromium
  // applies to `file://` pages when webSecurity is enabled and the app path
  // contains spaces (e.g. "RISK WISE").
  const buildRoot = path.join(basePath, "build");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const filePath = path.join(buildRoot, url.pathname === "/" ? "index.html" : url.pathname);
    return net.fetch(`file://${filePath}`);
  });

  try {
    userLogDir = path.join(app.getPath("userData"), "logs");
    userDataDir = app.getPath("userData");
    log.info("[electron] user data dir:", userDataDir);
    log.info("[electron] user log dir:", userLogDir);
    fs.mkdirSync(userLogDir, { recursive: true });
    configureLogRotation(log, userLogDir);
    log.initialize();
    autoUpdater.logger = log;
    log.info(`Starting RISKWISE ${app.getVersion()}. Packaged: ${app.isPackaged}`);
  } catch (error) {
    console.error("Failed to initialize logging:", error);
  }

  // Persistence bucket for update state — snooze deadlines, last-checked
  // timestamp, user-chosen channel, offline-mode flag (stubbed here; Area 14
  // toggles it from the Settings panel). Kept separate from `riskwise.db`.
  try {
    updateStore = new Store({ name: "riskwise-updates" });
  } catch (error) {
    log.error("[electron] failed to initialize update store:", error);
  }

  // Sentry crash reporting (issue #119, Area 17). Three independent gates,
  // *all* of which must hold for Sentry to initialize: (1) build embedded
  // a non-empty `SENTRY_DSN` (dev/fork builds skip this entirely);
  // (2) the user opted in on first launch (or post-factory-reset); and
  // (3) offline mode is not active (Area 14). The renderer never sees the
  // DSN — it only sees the resolved boolean status via `diagnostics:*`.
  initializeSentry();

  // Configure auto-updater BEFORE any other startup logic
  if (!isDevelopmentEnv()) {
    try {
      log.info("[electron] configuring auto-updater...");

      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.allowDowngrade = false;

      releaseChannel = resolveReleaseChannel(process.env.RELEASE_CHANNEL, app.getVersion());
      const storedChannel = updateStore?.get("channel");
      if (storedChannel && storedChannel !== releaseChannel) {
        releaseChannel = storedChannel;
      }
      autoUpdater.channel = releaseChannel;
      autoUpdater.allowPrerelease = releaseChannel !== "stable";

      autoUpdater.setFeedURL({
        provider: "github",
        owner: RELEASE_OWNER,
        repo: RELEASE_REPO,
        releaseType: "release",
      });

      // Azure Trusted Signing produces a valid Authenticode chain, so we
      // leave electron-updater's default `verifyUpdateCodeSignature`
      // function in place — it calls `signtool verify /pa` against the
      // configured `publisherName`. The previous NsisUpdater prototype
      // monkey-patch that disabled verification is gone; do NOT replace
      // it with a boolean (the property is function-typed and would
      // throw at download time). Signature verification is now active.
      log.info("[electron] update signature verification is enabled (Azure Trusted Signing)");

      log.info(
        `[electron] auto-updater configured channel=${releaseChannel} allowPrerelease=${autoUpdater.allowPrerelease}`
      );
    } catch (error) {
      log.error("[electron] failed to configure auto-updater:", error);
    }
  }

  createLoaderWindow();

  // Give loader window time to render
  await new Promise((resolve) => setTimeout(resolve, 100));

  updateLoaderMessage("Initializing application...");

  let pythonReady = false;

  // Start the Python backend process
  try {
    updateLoaderMessage("Starting application engine...");
    log.info("[electron] creating Python process...");
    global.pythonProcess = await createPythonProcess();

    updateLoaderMessage("Waiting for engine to be ready...");
    await waitForPythonProcessReady(global.pythonProcess);
    pythonReady = true;
  } catch (error) {
    log.error("[electron] Failed to start Python process:", error);
    pythonReady = false;

    dialog
      .showMessageBox({
        type: "warning",
        title: "RISKWISE Warning",
        message:
          "Application engine failed to start. Some features may not work correctly.\n\nLogs: " +
          userLogDir,
        buttons: ["Continue Anyway", "Exit"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 1) app.quit();
      });
  }

  // Clear temporary directory on startup
  if (pythonReady) {
    try {
      updateLoaderMessage("Clearing temporary files...");
      log.info("[electron] clearing temp directory...");
      await clearTempDir();
    } catch (error) {
      log.error("[electron] error clearing temp directory:", error);
    }
  } else {
    log.warn("[electron] skipping temp directory clear - Python not ready");
  }

  updateLoaderMessage("Loading application...");

  // Close loader window and open main window
  try {
    if (loaderWindow && !loaderWindow.isDestroyed()) {
      loaderWindow.close();
    }
    loaderWindow = null;
  } catch (error) {
    log.error("[electron] error closing loader window:", error);
  }

  createMainWindow();

  // Start the backend supervisor once the renderer is up so it can receive
  // ``backend-error`` IPC events if/when restarts are exhausted.
  if (pythonReady) {
    startHealthSupervisor();
  }

  // Check for updates AFTER main window is created, then poll every 4 h.
  // The renderer-side dialog (src/components/UpdateDialog.jsx) decides what
  // to show — the check itself just fires off an electron-updater probe.
  if (!isDevelopmentEnv()) {
    checkForAppUpdates("startup").catch(() => {});
    startUpdateCheckTimer();
  }

  importStartupDataPacks();
  if (isOfflineMode()) {
    ensureTileServer().catch((err) =>
      log.error("[electron] tile server start failed:", err.message)
    );
  }
  broadcastOfflineStatus();
});

const createLoaderWindow = () => {
  try {
    const iconPath = path.join(basePath, "build", "icon.ico");

    loaderWindow = new BrowserWindow({
      height: 200,
      width: 300,
      center: true,
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      autoHideMenuBar: true,
      icon: iconPath,
      webPreferences: { ...HARDENED_WEB_PREFERENCES },
    });

    const loaderPath = path.join(basePath, "build", "loader.html");
    loaderWindow.loadFile(loaderPath);
  } catch (error) {
    log.error("[electron] failed to create loader window:", error);
  }
};

const waitForPythonProcessReady = (pythonProcess, timeoutMs = 300000) => {
  return new Promise((resolve, reject) => {
    if (!pythonProcess) {
      return reject(new Error("Application engine process handle is null"));
    }

    let buffer = "";

    const handleData = (data) => {
      buffer += data.toString();
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, newlineIdx).trim();
        buffer = buffer.substring(newlineIdx + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "event" && event.name === "ready" && event.port) {
            backendBaseUrl = `http://127.0.0.1:${event.port}`;
            log.info("[electron] backend ready at", backendBaseUrl);
            clearTimeout(timeout);
            pythonProcess.stdout.off("data", handleData);
            pythonProcess.off("error", onError);
            resolve(backendBaseUrl);
            return;
          }
        } catch {
          // Ignore non-JSON output from Python
        }
      }
    };

    const onError = (error) => {
      clearTimeout(timeout);
      pythonProcess.stdout.off("data", handleData);
      pythonProcess.off("error", onError);
      reject(error);
    };

    const timeout = setTimeout(() => {
      pythonProcess.stdout.off("data", handleData);
      pythonProcess.off("error", onError);
      reject(new Error(`Application engine did not respond within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    pythonProcess.stdout.on("data", handleData);
    pythonProcess.on("error", onError);
  });
};

const randomErrorId = () => crypto.randomUUID();

// Parse the backend's structured error envelope into the shape the renderer
// consumes. Falls back to a synthetic envelope when the response isn't JSON
// or when we're reporting a client-side failure (e.g., backend down).
const parseErrorEnvelope = (text, status, requestId) => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.status === "error" && parsed.error_id) {
      return {
        code: parsed.code || "http_error",
        message: parsed.message || `HTTP ${status}`,
        detail: parsed.detail || null,
        error_id: parsed.error_id,
        request_id: parsed.request_id || requestId || null,
      };
    }
  } catch {
    // fall through
  }
  return {
    code: "http_error",
    message: `HTTP ${status}`,
    detail: text || null,
    error_id: randomErrorId(),
    request_id: requestId || null,
  };
};

class BackendError extends Error {
  constructor(envelope) {
    super(envelope.message);
    this.envelope = envelope;
  }
}

// Path prefixes that hit the CLIMADA Client API on the backend side.
// When offline mode is active, the IPC layer rejects these so a renderer
// XSS cannot exfiltrate via "fetch from client" actions even if the UI
// guard is bypassed. Add new client-bound routes to this list as they
// are wired up — the renderer surfaces the structured error envelope.
const CLIMADA_CLIENT_ROUTE_PREFIXES = [
  "/api/v1/climada-client/",
  "/api/v1/hazard/fetch-from-client",
];

const isClimadaClientRoute = (urlPath) =>
  typeof urlPath === "string" &&
  CLIMADA_CLIENT_ROUTE_PREFIXES.some((prefix) => urlPath.startsWith(prefix));

const httpRequest = async (method, path, body, requestId) => {
  if (isOfflineMode() && isClimadaClientRoute(path)) {
    throw new BackendError({
      code: "offline_mode_active",
      message: "CLIMADA Client API is unavailable in offline mode",
      detail: `Request to ${path} blocked because offline mode is enabled`,
      error_id: randomErrorId(),
      request_id: requestId || null,
    });
  }
  if (!backendBaseUrl) {
    throw new BackendError({
      code: "backend_unavailable",
      message: "Backend is not ready",
      detail: "Python process has not signalled ready",
      error_id: randomErrorId(),
      request_id: requestId || null,
    });
  }
  const effectiveRequestId = requestId || randomErrorId();
  const headers = { "Content-Type": "application/json", "X-Request-ID": effectiveRequestId };
  const options = { method, headers };
  if (body !== undefined && body !== null) {
    options.body = JSON.stringify(body);
  }
  log.info(`[electron] http ${method} ${path} request_id=${effectiveRequestId}`);
  const response = await fetch(`${backendBaseUrl}${path}`, options);
  const text = await response.text();
  if (!response.ok) {
    const envelope = parseErrorEnvelope(text, response.status, effectiveRequestId);
    log.warn(
      `[electron] http ${method} ${path} failed status=${response.status} request_id=${effectiveRequestId} error_id=${envelope.error_id}`,
    );
    throw new BackendError(envelope);
  }
  log.info(
    `[electron] http ${method} ${path} ok status=${response.status} request_id=${effectiveRequestId}`,
  );
  return text ? JSON.parse(text) : null;
};

const runScenarioOverSse = async (window, body, requestId) => {
  const effectiveRequestId = requestId || randomErrorId();
  const { job_id: jobId } = await httpRequest(
    "POST",
    "/api/v1/scenario/run",
    body,
    effectiveRequestId,
  );
  const streamResponse = await fetch(`${backendBaseUrl}/api/v1/scenario/${jobId}/stream`, {
    headers: { "X-Request-ID": effectiveRequestId },
  });
  if (!streamResponse.ok || !streamResponse.body) {
    throw new BackendError({
      code: "stream_open_failed",
      message: `Failed to open SSE stream`,
      detail: `HTTP ${streamResponse.status}`,
      error_id: randomErrorId(),
      request_id: effectiveRequestId,
    });
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let errorEnvelope = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.substring(0, sepIdx);
      buffer = buffer.substring(sepIdx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch (parseErr) {
          log.warn("[electron] failed to parse SSE line:", line, parseErr);
          continue;
        }
        if (payload.type === "progress") {
          if (window && !window.isDestroyed()) {
            window.webContents.send("progress", payload);
          }
        } else if (payload.type === "result") {
          finalResult = payload.data;
        } else if (payload.type === "error" || payload.type === "cancelled") {
          errorEnvelope = {
            code: payload.code,
            message: payload.message,
            detail: payload.detail || null,
            error_id: payload.error_id,
            request_id: payload.request_id || effectiveRequestId,
          };
        }
      }
    }
  }

  if (errorEnvelope) {
    throw new BackendError(errorEnvelope);
  }
  return finalResult;
};

const createMainWindow = () => {
  try {
    const iconPath = path.join(basePath, "build", "icon.ico");

    mainWindow = new BrowserWindow({
      minHeight: 720,
      minWidth: 1280,
      frame: false,
      resizable: true,
      autoHideMenuBar: true,
      thickFrame: true,
      icon: iconPath,
      show: false,
      webPreferences: {
        ...HARDENED_WEB_PREFERENCES,
        preload: path.join(basePath, "build", "preload.js"),
      },
    });

    mainWindow.show();
    mainWindow.maximize();
    mainWindow.loadURL("app://./index.html");

    if (isDevelopmentEnv()) {
      mainWindow.webContents.openDevTools();
    }

    // Pipe renderer console messages into unified log
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const lvl = level === 2 ? "warn" : level === 3 ? "error" : "info";
      const text = `[renderer] ${message} (${sourceId}:${line})`;
      if (lvl === "warn") log.warn(text);
      else if (lvl === "error") log.error(text);
      else log.info(text);
    });
  } catch (error) {
    log.error("[electron] failed to create main window:", error);

    // Critical error - show dialog and quit
    dialog.showErrorBox(
      "Startup Error",
      "Failed to create main window. Error: " + error.message + "\n\nLogs at: " + userLogDir
    );
    app.quit();
  }
};

const clearTempDir = async () => {
  if (!global.pythonProcess || global.pythonProcess.killed) {
    throw new Error("Python process is not running");
  }
  return await httpRequest("POST", "/api/v1/temp/clear", {});
};

// Pause poll until the in-flight restart resolves so we don't pile up
// overlapping restart attempts.
const startHealthSupervisor = () => {
  stopHealthSupervisor();
  healthPollTimer = setInterval(() => {
    if (supervisorBusy || !backendBaseUrl) return;
    runHealthCheck().catch((err) => log.error("[electron] supervisor loop error:", err));
  }, HEALTH_POLL_INTERVAL_MS);
};

const stopHealthSupervisor = () => {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }
};

const runHealthCheck = async () => {
  try {
    const response = await fetch(`${backendBaseUrl}/api/v1/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return;
  } catch (err) {
    log.warn("[electron] health check failed:", err.message);
  }
  supervisorBusy = true;
  try {
    await restartBackendWithBackoff();
  } finally {
    supervisorBusy = false;
  }
};

const restartBackendWithBackoff = async () => {
  cleanupPython();
  backendBaseUrl = null;

  for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
    const delay = Math.pow(2, attempt - 1) * 1000;
    log.info(
      `[electron] backend restart attempt ${attempt}/${MAX_RESTART_ATTEMPTS} after ${delay}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      global.pythonProcess = await createPythonProcess();
      await waitForPythonProcessReady(global.pythonProcess);
      log.info(`[electron] backend recovered on attempt ${attempt}`);
      return;
    } catch (err) {
      log.error(`[electron] restart attempt ${attempt} failed:`, err.message);
      cleanupPython();
      backendBaseUrl = null;
    }
  }

  const envelope = {
    code: "backend_unavailable",
    message: `Backend failed to recover after ${MAX_RESTART_ATTEMPTS} restart attempts`,
    detail: null,
    error_id: randomErrorId(),
  };
  log.error("[electron] backend permanently unavailable:", envelope.error_id);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("backend-error", envelope);
  }
  stopHealthSupervisor();
};

// Create a long-running Python process
const createPythonProcess = async () => {
  const scriptPath = path.join(basePath, "backend", "app.py");

  // Engine is installed under %LOCALAPPDATA%\RiskWiseEngine\python.exe
  const engineRoot = process.env.LOCALAPPDATA;
  if (!engineRoot) {
    throw new Error("Failed to resolve LOCALAPPDATA environment variable");
  }

  const enginePath = path.join(engineRoot, "RiskWiseEngine");
  let pythonExecutable = path.join(enginePath, "python.exe");

  // Download and install engine if missing
  if (!fs.existsSync(pythonExecutable)) {
    log.info("[electron] Python engine not found, initiating download...");
    pythonExecutable = await downloadAndInstallEngine(loaderWindow);
  }

  if (!fs.existsSync(scriptPath)) {
    throw new Error("Python script not found at: " + scriptPath);
  }

  try {
    const py = spawn(pythonExecutable, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        LOG_DIR: userLogDir,
        RISKWISE_USER_DATA: userDataDir,
      },
    });

    py.on("error", (error) => log.error("Python spawn error:", error.message));
    py.on("exit", (code, signal) => {
      log.warn("Python exited. Code:", code, "Signal:", signal);
      backendBaseUrl = null;
    });
    py.stderr.on("data", (data) => log.error(`[python] ${data.toString().trim()}`));

    log.info("[electron] Python process spawned with PID:", py.pid);
    return py;
  } catch (error) {
    log.error("[electron] error during Python process creation:", error);
    throw error;
  }
};

const toIpcError = (error, requestId) => {
  if (error instanceof BackendError) return error.envelope;
  return {
    code: "ipc_error",
    message: error && error.message ? error.message : "Unknown error",
    detail: null,
    error_id: randomErrorId(),
    request_id: requestId || null,
  };
};

const withRequestIdHandling = (channel, runner) => {
  ipcMain.handle(channel, async (_evt, payload) => {
    const requestId = payload && payload.requestId;
    try {
      const result = await runner(payload, requestId);
      return { success: true, result };
    } catch (error) {
      log.error(`[electron] ${channel} error request_id=${requestId || "-"}:`, error);
      return { success: false, error: toIpcError(error, requestId) };
    }
  });
};

withRequestIdHandling("http:request", ({ method, path, body }, requestId) =>
  httpRequest(method, path, body, requestId),
);

withRequestIdHandling("http:scenarioRun", (payload, requestId) => {
  const body = payload && payload.body !== undefined ? payload.body : payload;
  return runScenarioOverSse(mainWindow, body, requestId);
});

withRequestIdHandling("http:cancelScenario", (payload, requestId) => {
  const jobId = payload && payload.jobId !== undefined ? payload.jobId : payload;
  return httpRequest("POST", `/api/v1/scenario/${jobId}/cancel`, {}, requestId);
});

// Renderer logger bridge: the frontend ``logger.ts`` wrapper sends records
// here; we fan them out into electron-log so one ``app.log`` has entries
// from every layer, correlated by request_id.
ipcMain.on("log:renderer", (_evt, record) => {
  if (!record || typeof record.message !== "string") return;
  const level = ["debug", "info", "warn", "error"].includes(record.level) ? record.level : "info";
  const suffix = record.context ? ` ${JSON.stringify(record.context)}` : "";
  log[level](`[renderer] ${record.message}${suffix}`);
});

ipcMain.handle("is-development-env", () => {
  return !app.isPackaged;
});

ipcMain.handle("fetch-temp-dir", () => {
  return path.join(userDataDir, "data", "temp");
});

ipcMain.handle("fetch-report-dir", () => {
  return path.join(userDataDir, "data", "reports");
});

ipcMain.handle("fetch-log-dir", () => {
  return userLogDir || path.join(app.getPath("userData"), "logs");
});

// Handle clear temporary directory request
ipcMain.handle("clear-temp-dir", async () => {
  try {
    const result = await clearTempDir();
    log.info("[electron] Temporary directory cleared:", result.message);
    return { success: true, result };
  } catch (error) {
    log.error("[electron] Failed to clear temporary directory:", error);
    return { success: false, error: error.message };
  }
});

// Handle save screenshot request
ipcMain.handle("save-screenshot", async (event, { blob, filePath }) => {
  try {
    const buffer = Buffer.from(blob, "base64");
    const dir = path.dirname(filePath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, buffer);

    event.sender.send("save-screenshot-reply", { success: true, filePath });
    log.info("[electron] screenshot saved:", filePath);
  } catch (error) {
    log.error("[electron] failed to save screenshot:", error);
    event.sender.send("save-screenshot-reply", { success: false, error: error.message });
  }
});

// Handle folder copy request
ipcMain.handle("copy-folder", async (event, { sourceFolder, destinationFolder }) => {
  try {
    fs.mkdirSync(destinationFolder, { recursive: true });
    const files = fs.readdirSync(sourceFolder);

    for (const file of files) {
      const sourcePath = path.join(sourceFolder, file);
      const destinationPath = path.join(destinationFolder, file);
      fs.copyFileSync(sourcePath, destinationPath);
    }

    event.sender.send("copy-folder-reply", { success: true, destinationFolder });
    log.info("[electron] folder copied:", sourceFolder, "->", destinationFolder);
  } catch (error) {
    log.error("[electron] failed to copy folder:", error);
    event.sender.send("copy-folder-reply", { success: false, error: error.message });
  }
});

// Handle copy file from temp folder request
ipcMain.handle("copy-file", async (event, { sourcePath, destinationPath }) => {
  try {
    const dir = path.dirname(destinationPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);

    event.sender.send("copy-file-reply", { success: true, destinationPath });
    log.info("[electron] file copied:", sourcePath, "->", destinationPath);
  } catch (error) {
    log.error("[electron] failed to copy file:", error);
    event.sender.send("copy-file-reply", { success: false, error: error.message });
  }
});

ipcMain.handle("open-report", async (_event, reportPath) => {
  try {
    await shell.openPath(reportPath);
    log.info("[electron] opened report:", reportPath);
  } catch (error) {
    log.error("[electron] failed to open report:", error);
  }
});

const PRINT_READY_POLL_MS = 200;
const PRINT_READY_TIMEOUT_MS = 15000;

const waitForPrintReady = (webContents) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + PRINT_READY_TIMEOUT_MS;
    const check = async () => {
      if (Date.now() > deadline) {
        reject(new Error("Print view timed out — scenario data did not load in time"));
        return;
      }
      try {
        const ready = await webContents.executeJavaScript(
          "document.body.dataset.printReady"
        );
        if (ready === "true") {
          resolve();
        } else {
          setTimeout(check, PRINT_READY_POLL_MS);
        }
      } catch {
        setTimeout(check, PRINT_READY_POLL_MS);
      }
    };
    check();
  });

ipcMain.handle("export-pdf", async (_event, { scenarioId }) => {
  let printWin = null;
  try {
    printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        ...HARDENED_WEB_PREFERENCES,
        preload: path.join(basePath, "build", "preload.js"),
      },
    });

    await new Promise((resolve, reject) => {
      printWin.webContents.once("did-finish-load", resolve);
      printWin.webContents.once("did-fail-load", (_e, code, desc) =>
        reject(new Error(`Print view failed to load: ${desc} (${code})`))
      );
      printWin.loadURL(`app://./index.html?view=print&scenarioId=${encodeURIComponent(scenarioId)}`);
    });

    await waitForPrintReady(printWin.webContents);

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
    });

    printWin.destroy();
    printWin = null;

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: `riskwise-scenario-${scenarioId}.pdf`,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      return { success: false, reason: "cancelled" };
    }

    fs.writeFileSync(filePath, pdfBuffer);
    log.info("[electron] PDF saved:", filePath);
    return { success: true, filePath };
  } catch (error) {
    log.error("[electron] PDF export failed:", error);
    if (printWin && !printWin.isDestroyed()) printWin.destroy();
    return { success: false, reason: error.message };
  }
});

// Workspace ZIP export/import (issue #82).
//
// Export: backend builds the `.riskwise-workspace` archive at a temp path,
// returns the path; main moves the file to the user-chosen destination and
// unlinks the source so the temp copy does not linger.
// Import: Electron shows the open dialog, POSTs the chosen path to the
// backend, which validates the manifest and merges scenarios skipping
// duplicate UUIDs.
ipcMain.handle("export-workspace", async () => {
  try {
    const response = await httpRequest("GET", "/api/v1/workspace/export-data", null);
    const exportPath = response?.data?.export_path;
    const scenarioCount = response?.data?.scenario_count ?? 0;
    if (!exportPath) {
      return { success: false, reason: "Backend did not return an export path" };
    }

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Export Workspace",
      defaultPath: path.basename(exportPath),
      filters: [{ name: "RISK WISE Workspace", extensions: ["riskwise-workspace"] }],
    });

    if (canceled || !filePath) {
      try {
        fs.unlinkSync(exportPath);
        fs.rmdirSync(path.dirname(exportPath));
      } catch (err) {
        log.warn("[electron] cleanup after cancelled export failed:", err.message);
      }
      return { success: false, reason: "cancelled" };
    }

    fs.copyFileSync(exportPath, filePath);
    try {
      fs.unlinkSync(exportPath);
      fs.rmdirSync(path.dirname(exportPath));
    } catch (err) {
      log.warn("[electron] failed to remove export temp file:", err.message);
    }

    log.info("[electron] workspace exported:", filePath);
    return { success: true, filePath, scenarioCount };
  } catch (error) {
    const message = error instanceof BackendError ? error.envelope.message : error.message;
    log.error("[electron] workspace export failed:", message);
    return { success: false, reason: message };
  }
});

ipcMain.handle("import-workspace", async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Import Workspace",
      properties: ["openFile"],
      filters: [{ name: "RISK WISE Workspace", extensions: ["riskwise-workspace"] }],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
    }

    const importPath = filePaths[0];
    const response = await httpRequest("POST", "/api/v1/workspace/import", {
      import_path: importPath,
    });
    const imported = response?.data?.imported_count ?? 0;
    const skipped = response?.data?.skipped_count ?? 0;
    log.info("[electron] workspace imported:", { imported, skipped });
    return { success: true, imported, skipped };
  } catch (error) {
    const message = error instanceof BackendError ? error.envelope.message : error.message;
    log.error("[electron] workspace import failed:", message);
    return { success: false, reason: message };
  }
});

// Custom data pack selection (issue #90). The Settings > Custom Data tab
// either gets the path from a dropped File (via ``webUtils.getPathForFile``
// in preload) or asks the main process to open a native file picker here.
// Validation, import, and delete all go through the regular ``api.http``
// bridge — no binary crosses the IPC boundary.
ipcMain.handle("select-custom-data-pack", async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Import Country Pack",
      properties: ["openFile"],
      filters: [{ name: "Country Pack", extensions: ["zip"] }],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
    }
    return { success: true, filePath: filePaths[0] };
  } catch (error) {
    log.error("[electron] select-custom-data-pack failed:", error);
    return { success: false, reason: error.message };
  }
});

// CRED dataset upload (issue #91): same pattern as the country pack picker —
// the main process returns an absolute path, the renderer forwards it to
// ``POST /api/v1/macro/datasets`` so binary never crosses the IPC boundary.
ipcMain.handle("select-cred-dataset", async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Upload CRED Dataset",
      properties: ["openFile"],
      filters: [{ name: "CRED Dataset", extensions: ["xlsx"] }],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
    }
    return { success: true, filePath: filePaths[0] };
  } catch (error) {
    log.error("[electron] select-cred-dataset failed:", error);
    return { success: false, reason: error.message };
  }
});

// Adaptation-measure set upload (issue #92): mirrors the CRED picker —
// the main process resolves an absolute xlsx path; the renderer forwards
// it to ``POST /api/v1/measures/datasets`` where validation happens.
ipcMain.handle("select-measures-dataset", async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Upload Adaptation Measures",
      properties: ["openFile"],
      filters: [{ name: "Adaptation Measures", extensions: ["xlsx"] }],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
    }
    return { success: true, filePath: filePaths[0] };
  } catch (error) {
    log.error("[electron] select-measures-dataset failed:", error);
    return { success: false, reason: error.message };
  }
});

// ---------------------------------------------------------------------------
// Auto-update pipeline (issue #115, Area 13)
// ---------------------------------------------------------------------------

// Offline mode. The toggle persists in `electron-store` (separate from
// `riskwise.db` so the app still works if the DB is unavailable). Every
// network code path — update check, release-notes fetch, engine-manifest
// fetch, engine download, future telemetry — must call `isOfflineMode()`
// before going to the network. The renderer learns the current state
// via `offline:get-status` and `offline:status-changed`.
const PACKS_DIRNAME = "packs";
const USER_DATA_SUBDIR = "user-data";

const NOOP_TILE_SERVER = Object.freeze({ port: null, close: async () => {} });

let tileServerHandle = NOOP_TILE_SERVER;
let importedPacks = [];
let cachedMbtilesPath;

const isOfflineMode = () => {
  if (!updateStore) return false;
  return Boolean(updateStore.get("offlineMode", false));
};

// The tile pack path doesn't change at runtime — packed once into
// `extraResources` by the offline installer, never moved. Cache the
// first lookup so per-IPC `offline:get-status` calls don't re-stat.
const getMbtilesPath = () => {
  if (cachedMbtilesPath === undefined) {
    cachedMbtilesPath = resolveBundledResource("data", "tiles", TILES_FILENAME);
  }
  return cachedMbtilesPath;
};

const getOfflineStatus = () => ({
  enabled: isOfflineMode(),
  tilePort: tileServerHandle.port,
  tilesPath: getMbtilesPath(),
  importedPacks,
});

const broadcastOfflineStatus = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("offline:status-changed", getOfflineStatus());
  }
};

const ensureTileServer = async () => {
  if (!isOfflineMode()) {
    if (tileServerHandle.port) {
      await tileServerHandle.close();
      tileServerHandle = NOOP_TILE_SERVER;
    }
    return;
  }
  if (tileServerHandle.port) return;
  const mbtilesPath = getMbtilesPath();
  if (!mbtilesPath) {
    log.warn("[electron] offline mode active but no MBTiles pack found — tiles unavailable");
    return;
  }
  try {
    tileServerHandle = await startTileServer({ mbtilesPath, logger: log });
  } catch (err) {
    log.error("[electron] failed to start tile server:", err.message);
    tileServerHandle = NOOP_TILE_SERVER;
  }
};

const setOfflineMode = async (enabled) => {
  if (!updateStore) {
    return { error: "update store not initialized" };
  }
  updateStore.set("offlineMode", Boolean(enabled));
  log.info(`[electron] offline mode -> ${enabled ? "enabled" : "disabled"}`);
  await ensureTileServer();
  broadcastOfflineStatus();
  return getOfflineStatus();
};

// Scan `%APPDATA%/RISK WISE/packs/` for `.riskwise-pack` files. Each
// pack needs a sibling `.minisig` produced by `minisign -Sm <pack>`;
// verification uses the engine-manifest public key. A bad signature
// rejects the pack with a structured error the renderer surfaces in
// the Offline panel.
const importStartupDataPacks = () => {
  importedPacks = [];
  let publicKeyText;
  try {
    publicKeyText = readEnginePublicKey();
  } catch (err) {
    log.warn(`[electron] data-pack scan skipped: ${err.message}`);
    return importedPacks;
  }
  try {
    importedPacks = scanAndImportPacks({
      packsDir: path.join(userDataDir, PACKS_DIRNAME),
      publicKeyText,
      destRoot: path.join(userDataDir, USER_DATA_SUBDIR),
      logger: log,
    });
  } catch (err) {
    log.error(`[electron] data-pack scan failed: ${err.message}`);
  }
  return importedPacks;
};

// ---------------------------------------------------------------------------
// Sentry + diagnostics (issue #119, Area 17)
// ---------------------------------------------------------------------------

let sentryInitialized = false;
let sentryStatusReason = "not_configured";
let cachedSentryDsn;

// CI runs `scripts/write-sentry-dsn.js` after `vite build` to write a
// sidecar `sentry-dsn.json` with the GitHub Actions secret. We read
// from there first so packaged builds carry the DSN exactly once, in a
// place that's trivial to rotate or inspect; falling back to
// `process.env.SENTRY_DSN` keeps `npm run start:electron` working in
// dev when an engineer wants to test Sentry locally.
const resolveSentryDsn = () => {
  if (cachedSentryDsn !== undefined) return cachedSentryDsn;
  try {
    const sidecarPath = path.join(basePath, "build", "sentry-dsn.json");
    const text = fs.readFileSync(sidecarPath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.dsn === "string" && parsed.dsn.length > 0) {
      cachedSentryDsn = parsed.dsn;
      return cachedSentryDsn;
    }
  } catch {
    // Missing or malformed sidecar → fall through to env var.
  }
  cachedSentryDsn = process.env.SENTRY_DSN || "";
  return cachedSentryDsn;
};

// Sentry init runs in the Electron main process only — issue #119 forbids
// adding it to the renderer because that would couple Sentry to the React
// build and risk leaking renderer-side strings (URLs, scenario params)
// that the renderer is not allowed to send. CI bakes the DSN into the
// build via `scripts/write-sentry-dsn.js`; dev/fork builds without the
// secret simply skip the import entirely.
const initializeSentry = () => {
  const dsn = resolveSentryDsn();
  if (!dsn) {
    sentryStatusReason = "no_dsn";
    log.info("[electron] Sentry not initialized (no SENTRY_DSN configured)");
    return;
  }
  if (isOfflineMode()) {
    sentryStatusReason = "offline_mode";
    log.info("[electron] Sentry not initialized (offline mode active)");
    return;
  }
  if (!updateStore) {
    sentryStatusReason = "no_store";
    log.warn("[electron] Sentry not initialized (electron-store unavailable)");
    return;
  }
  const consent = updateStore.get("sentryConsent");
  if (consent !== "opted_in") {
    sentryStatusReason = consent === "opted_out" ? "opted_out" : "no_consent";
    log.info(`[electron] Sentry not initialized (consent=${consent || "unset"})`);
    return;
  }
  try {
    const Sentry = require("@sentry/electron/main");
    Sentry.init({
      dsn,
      release: app.getVersion(),
      environment: app.isPackaged ? "production" : "development",
    });
    sentryInitialized = true;
    sentryStatusReason = "active";
    log.info("[electron] Sentry initialized for crash reporting");
  } catch (err) {
    sentryStatusReason = "init_failed";
    log.error("[electron] Sentry init failed:", err.message);
  }
};

const getSentryStatus = () => ({
  initialized: sentryInitialized,
  reason: sentryStatusReason,
  dsnConfigured: Boolean(resolveSentryDsn()),
  consent: updateStore?.get("sentryConsent") || null,
  offline: isOfflineMode(),
});

const setSentryConsent = (optIn) => {
  if (!updateStore) return { error: "update store not initialized" };
  updateStore.set("sentryConsent", optIn ? "opted_in" : "opted_out");
  // Re-evaluate init: opting in mid-session should arm Sentry; opting out
  // mid-session leaves the existing client running but stops future inits
  // on next launch — `@sentry/electron` does not expose a clean shutdown
  // we can rely on, so the simplest contract is "consent change takes full
  // effect on next launch", which we also document in docs/privacy.md.
  if (optIn && !sentryInitialized) initializeSentry();
  return getSentryStatus();
};

// First-launch consent gate. The actual UX lives in the renderer (a MUI
// dialog matching the rest of the app, mirroring the auto-update consent
// pattern in #115). This helper just decides whether to *prompt* — the
// renderer reads the result via `diagnostics:get-sentry-status` and
// commits the user's choice via `diagnostics:set-sentry-consent`.
const shouldPromptForSentryConsent = () => {
  if (!updateStore) return false;
  if (!resolveSentryDsn()) return false; // No DSN → never prompt
  if (isOfflineMode()) return false;
  return updateStore.get("sentryConsent") === undefined;
};

const collectSystemInfo = () => {
  const cpus = os.cpus() || [];
  let diskFree = null;
  try {
    // Node ≥18.15 added `fs.statfsSync`; fall back to null on older runtimes
    // rather than failing the whole diagnostics export.
    if (typeof fs.statfsSync === "function") {
      const stat = fs.statfsSync(userDataDir || os.homedir());
      diskFree = stat.bavail * stat.bsize;
    }
  } catch (err) {
    log.warn("[electron] statfs failed for diagnostics:", err.message);
  }
  return {
    generated_at: new Date().toISOString(),
    app_version: app.getVersion(),
    engine_version: updateStore?.get("engine.version") || null,
    release_channel: releaseChannel,
    offline_mode: isOfflineMode(),
    sentry: getSentryStatus(),
    os: {
      platform: process.platform,
      release: os.release(),
      version: typeof os.version === "function" ? os.version() : null,
      arch: process.arch,
    },
    cpu: {
      model: cpus[0]?.model || null,
      cores: cpus.length,
    },
    memory: {
      total_bytes: os.totalmem(),
      free_bytes: os.freemem(),
    },
    disk: {
      free_bytes: diskFree,
    },
  };
};

const fetchRecentScenarioRows = async () => {
  if (!backendBaseUrl) return [];
  try {
    const result = await httpRequest("GET", "/api/v1/scenarios", null, null);
    // The backend wraps every list response in `{data: [...], status: ...}`.
    // `list_scenarios` returns rows ordered by `created_at DESC`, so the
    // first 5 are the most recently computed.
    const rows = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.scenarios)
        ? result.scenarios
        : Array.isArray(result)
          ? result
          : [];
    return rows.slice(0, 5).map(sanitizeScenarioRow).filter(Boolean);
  } catch (err) {
    log.warn("[electron] diagnostics scenario fetch failed:", err.message);
    return [];
  }
};

const exportDiagnostics = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultName = `riskwise-diagnostics-${timestamp}.zip`;
  const desktopPath = path.join(app.getPath("desktop"), defaultName);

  const dialogResult = await dialog.showSaveDialog({
    title: "Save diagnostics ZIP",
    defaultPath: desktopPath,
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });
  if (dialogResult.canceled || !dialogResult.filePath) {
    return { canceled: true };
  }

  const electronLogDir = userLogDir || path.join(app.getPath("userData"), "logs");
  // The Python backend writes to %APPDATA%/RISK WISE/logs/, which on Windows
  // resolves to the same `userData` parent that electron-log uses. Both dirs
  // can coincide; collectRecentLogs dedupes by filename via separate ZIP
  // subdirs, so an overlap surfaces files in both folders deliberately.
  const pythonLogDir = path.join(app.getPath("userData"), "logs");

  const systemInfo = collectSystemInfo();
  const scenarioRows = await fetchRecentScenarioRows();

  try {
    const result = buildDiagnosticsZip({
      outPath: dialogResult.filePath,
      electronLogDir,
      pythonLogDir,
      systemInfo,
      scenarioRows,
    });
    log.info(`[electron] diagnostics ZIP written: ${result.outPath} entries=${result.entryCount}`);
    return { ok: true, filePath: result.outPath, entryCount: result.entryCount };
  } catch (err) {
    log.error("[electron] diagnostics export failed:", err.message);
    return { error: err.message };
  }
};

const checkForAppUpdates = async (reason) => {
  if (isDevelopmentEnv()) {
    log.info(`[electron] update check skipped (dev env) reason=${reason}`);
    return { skipped: "dev" };
  }
  if (isOfflineMode()) {
    log.info(`[electron] update check skipped (offline mode) reason=${reason}`);
    return { skipped: "offline" };
  }
  try {
    log.info(`[electron] checking for app updates reason=${reason} channel=${releaseChannel}`);
    await autoUpdater.checkForUpdates();
    if (updateStore) updateStore.set("lastChecked", Date.now());
    return { ok: true };
  } catch (err) {
    log.error("[electron] update check failed:", err.message);
    return { error: err.message };
  }
};

const startUpdateCheckTimer = () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    checkForAppUpdates("interval").catch((err) =>
      log.error("[electron] interval update check errored:", err)
    );
  }, UPDATE_CHECK_INTERVAL_MS);
};

// Renderer-callable wrapper that the Settings panel invokes when the user
// chooses "Install on next restart". We set autoDownload and begin the
// download; electron-updater fires `update-downloaded` when it's ready, and
// the quit-install happens naturally when the user closes the app.
const beginUpdateDownload = async () => {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    log.error("[electron] downloadUpdate failed:", err.message);
    return { error: err.message };
  }
};

const snoozeUpdateReminder = () => {
  if (!updateStore) return { error: "update store not initialized" };
  const remindAfter = Date.now() + REMIND_SNOOZE_MS;
  updateStore.set("remindAfter", remindAfter);
  log.info(`[electron] update reminder snoozed until ${new Date(remindAfter).toISOString()}`);
  return { ok: true, remindAfter };
};

const setReleaseChannel = (channel) => {
  if (!["stable", "beta", "internal"].includes(channel)) {
    return { error: `invalid channel: ${channel}` };
  }
  if (updateStore) updateStore.set("channel", channel);
  releaseChannel = channel;
  if (!isDevelopmentEnv()) {
    autoUpdater.channel = channel;
    autoUpdater.allowPrerelease = channel !== "stable";
  }
  log.info(`[electron] release channel set to ${channel}`);
  return { ok: true, channel };
};

// Download to a Buffer via the Electron `net` module. Using `net` instead
// of Node `https` gets us the system proxy and certificate store for free,
// which matters on corporate Windows where a custom CA is common.
const fetchBuffer = (url, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = net.request(url);
    for (const [name, value] of Object.entries(headers)) {
      req.setHeader(name, value);
    }
    req.on("response", (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        } else {
          reject(new Error(`HTTP ${response.statusCode} ${response.statusMessage || ""}`.trim()));
        }
      });
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

// Append to a file via HTTP Range. Returns the total bytes after append.
// The caller passes the current on-disk size; we ask the server for that
// offset onwards and stream directly into an append-mode stream. If the
// server doesn't honor the Range header we fall back to a full fetch.
const downloadRange = (url, destPath, startByte) =>
  new Promise((resolve, reject) => {
    const headers = {};
    if (startByte > 0) headers.Range = `bytes=${startByte}-`;
    const req = net.request(url);
    for (const [name, value] of Object.entries(headers)) {
      req.setHeader(name, value);
    }
    req.on("response", (response) => {
      if (response.statusCode === 416) {
        // File already complete — server says the requested range is
        // beyond end-of-resource. Treat as success and let the hash check
        // validate the on-disk file.
        resolve({ appended: 0, resumed: true });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const resumed = response.statusCode === 206 && startByte > 0;
      const flags = resumed ? "a" : "w";
      const out = fs.createWriteStream(destPath, { flags });
      let appended = 0;
      response.on("data", (chunk) => {
        appended += chunk.length;
        out.write(chunk);
      });
      response.on("end", () => {
        out.end();
        out.on("close", () => resolve({ appended, resumed }));
      });
      response.on("error", (err) => {
        out.destroy();
        reject(err);
      });
    });
    req.on("error", reject);
    req.end();
  });

const sha256File = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

// In dev the unpackaged tree keeps `resources/` and `data/` alongside
// `public/`; in a packaged build electron-builder copies them under the
// app resources root. `process.resourcesPath` is the packaged location;
// `basePath` covers the dev case. Returns the first existing candidate
// path, or `null` if none match — caller decides whether absence is an
// error (engine pubkey, throw) or the expected normal path (tile pack
// in the lean installer).
const resolveBundledResource = (...segments) => {
  const candidates = [
    path.join(basePath, ...segments),
    process.resourcesPath ? path.join(process.resourcesPath, ...segments) : null,
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const readEnginePublicKey = () => {
  const found = resolveBundledResource("resources", ENGINE_PUB_KEY_FILENAME);
  if (!found) {
    throw new Error(
      `engine-manifest public key not found alongside resources/${ENGINE_PUB_KEY_FILENAME}`
    );
  }
  return fs.readFileSync(found, "utf8");
};

// Fetch + verify the engine manifest. Verification must happen BEFORE we
// trust the `sha256` or `download_url` inside — a compromised release
// account could otherwise ship a malicious engine to every installed app.
const fetchVerifiedEngineManifest = async () => {
  if (isOfflineMode()) {
    throw new Error("engine manifest fetch skipped: offline mode is active");
  }
  const { body } = await fetchBuffer(ENGINE_MANIFEST_URL, {
    "User-Agent": `RiskWise/${app.getVersion()}`,
  });
  const text = body.toString("utf8");
  const pubKey = readEnginePublicKey();
  const manifest = verifyEngineManifest(text, pubKey);
  log.info(`[electron] engine manifest verified version=${manifest.version}`);
  return manifest;
};

// Resumable engine download with SHA-256 verification. `destPath` is
// treated as append-mode on retry: we ask the server for the remainder
// via HTTP Range. A post-download hash mismatch wipes the file so the
// next retry starts clean.
const downloadEngineWithResume = async (manifest, destPath, { maxAttempts = 3 } = {}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const startByte = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
      log.info(
        `[electron] engine download attempt ${attempt}/${maxAttempts} startByte=${startByte}`
      );
      const result = await downloadRange(manifest.download_url, destPath, startByte);
      log.info(
        `[electron] engine download appended=${result.appended} resumed=${result.resumed}`
      );
      const actualHash = await sha256File(destPath);
      if (actualHash.toLowerCase() === String(manifest.sha256).toLowerCase()) {
        log.info("[electron] engine SHA-256 matches manifest");
        return { ok: true, path: destPath, sha256: actualHash };
      }
      log.warn(
        `[electron] engine SHA-256 mismatch expected=${manifest.sha256} actual=${actualHash} — restarting from byte 0`
      );
      fs.unlinkSync(destPath);
    } catch (err) {
      log.error(`[electron] engine download attempt ${attempt} failed:`, err.message);
      if (attempt === maxAttempts) throw err;
    }
  }
  throw new Error(`engine download failed after ${maxAttempts} attempts`);
};

const isEngineBlocked = (manifest, cachedEngineVersion) => {
  if (!manifest) return false;
  if (!cachedEngineVersion) return true;
  return !isEngineVersionCompatible(cachedEngineVersion, manifest);
};

// Release notes: we strip the body down to the `## en` (or `## en-US`)
// section so the "What's New" panel shows localized content only. The
// heading matches a simple `## en[^\n]*` pattern; anything before the
// next `##` is kept. 1 h cache sidesteps GitHub API rate limits.
const extractLanguageSection = (body, lang) => {
  if (typeof body !== "string") return "";
  const re = new RegExp(`(^|\n)##\\s+${lang}(?:-[A-Za-z]+)?\\s*\n([\\s\\S]*?)(?=\n##\\s+|$)`);
  const match = body.match(re);
  return match ? match[2].trim() : body.trim();
};

const fetchReleaseNotes = async ({ tag, language = "en" } = {}) => {
  if (isOfflineMode()) {
    return { skipped: "offline" };
  }
  const cacheKey = `${tag || "latest"}:${language}`;
  const cached = releaseNotesCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RELEASE_NOTES_CACHE_MS) {
    return { ...cached, cached: true };
  }
  const url = tag ? `${GITHUB_RELEASE_API}/tags/${tag}` : `${GITHUB_RELEASE_API}/latest`;
  const { body } = await fetchBuffer(url, {
    Accept: "application/vnd.github+json",
    "User-Agent": `RiskWise/${app.getVersion()}`,
  });
  const release = JSON.parse(body.toString("utf8"));
  const section = extractLanguageSection(release.body || "", language);
  const payload = {
    fetchedAt: Date.now(),
    tag: release.tag_name,
    name: release.name,
    body: section,
    language,
  };
  releaseNotesCache.set(cacheKey, payload);
  return payload;
};

ipcMain.handle("updates:check", async () => {
  return checkForAppUpdates("user");
});

ipcMain.handle("updates:install-on-next-restart", async () => {
  return beginUpdateDownload();
});

ipcMain.handle("updates:remind-later", async () => {
  return snoozeUpdateReminder();
});

ipcMain.handle("updates:get-status", async () => {
  return {
    currentVersion: app.getVersion(),
    channel: releaseChannel,
    lastChecked: updateStore ? updateStore.get("lastChecked", null) : null,
    remindAfter: updateStore ? updateStore.get("remindAfter", 0) : 0,
    offlineMode: isOfflineMode(),
  };
});

ipcMain.handle("updates:set-channel", async (_evt, channel) => setReleaseChannel(channel));

ipcMain.handle("updates:get-release-notes", async (_evt, opts) => {
  try {
    return await fetchReleaseNotes(opts || {});
  } catch (err) {
    log.error("[electron] fetchReleaseNotes failed:", err.message);
    return { error: err.message };
  }
});

// "Downgrade to previous version" reuses electron-updater's two-arg
// quitAndInstall(isSilent, isForceRunAfter) — passing (true, false)
// performs a silent install without relaunching, which is what the AC
// requires so the user can hand-pick the previous installer after quit.
ipcMain.handle("updates:downgrade", async () => {
  try {
    setImmediate(() => autoUpdater.quitAndInstall(true, false));
    return { ok: true };
  } catch (err) {
    log.error("[electron] downgrade failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("engine:verify-manifest", async () => {
  try {
    const manifest = await fetchVerifiedEngineManifest();
    return { ok: true, manifest };
  } catch (err) {
    log.error("[electron] engine manifest verification failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("engine:check-blocked", async () => {
  try {
    const manifest = await fetchVerifiedEngineManifest();
    const cachedEngineVersion = updateStore ? updateStore.get("engine.version", null) : null;
    const blocked = isEngineBlocked(manifest, cachedEngineVersion);
    return { ok: true, blocked, manifestVersion: manifest.version, cachedEngineVersion };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("offline:get-status", () => getOfflineStatus());

ipcMain.handle("offline:set-enabled", async (_evt, payload) => {
  const enabled = Boolean(payload && payload.enabled);
  return setOfflineMode(enabled);
});

ipcMain.handle("data-packs:get-status", () => importedPacks);

ipcMain.handle("data-packs:rescan", () => {
  const results = importStartupDataPacks();
  broadcastOfflineStatus();
  return results;
});

// Diagnostics + Sentry consent (issue #119, Area 17). The diagnostics ZIP
// is local-only — no remote upload, even if Sentry is opted in.
ipcMain.handle("diagnostics:export", () => exportDiagnostics());
ipcMain.handle("diagnostics:get-sentry-status", () => ({
  ...getSentryStatus(),
  shouldPromptConsent: shouldPromptForSentryConsent(),
}));
ipcMain.handle("diagnostics:set-sentry-consent", (_evt, payload) => {
  return setSentryConsent(Boolean(payload?.optIn));
});

ipcMain.handle("engine:download-update", async () => {
  try {
    const manifest = await fetchVerifiedEngineManifest();
    const engineRoot = process.env.LOCALAPPDATA;
    if (!engineRoot) throw new Error("LOCALAPPDATA is not defined");
    const destPath = path.join(engineRoot, "RiskWiseEngine.download");
    await downloadEngineWithResume(manifest, destPath);
    if (updateStore) updateStore.set("engine.version", manifest.version);
    return { ok: true, version: manifest.version };
  } catch (err) {
    log.error("[electron] engine download failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.on("minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on("shutdown", () => {
  log.info("[electron] shutting down application...");
  cleanupPython();
  app.quit();
});

ipcMain.on("reload", async () => {
  log.info("[electron] reload CLIMADA App...");

  try {
    const result = await clearTempDir();
    log.info("[electron] Temporary directory cleared:", result.message);
  } catch (error) {
    log.error("[electron] failed to clear temporary directory:", error);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reloadIgnoringCache();
  }
});

// Auto-update event handlers
autoUpdater.on("update-not-available", () => {
  log.info("[electron] no update available");
});

autoUpdater.on("download-progress", (p) => {
  log.info(`[electron] downloading ${p.percent.toFixed(1)}% (${p.transferred}/${p.total})`);
});

autoUpdater.on("update-available", (info) => {
  const version = info?.version ?? "unknown";
  log.info("[electron] update available:", version);
  if (updateStore) {
    updateStore.set("lastChecked", Date.now());
    const remindAfter = Number(updateStore.get("remindAfter", 0)) || 0;
    if (Date.now() < remindAfter) {
      log.info(
        `[electron] update-available dialog snoozed until ${new Date(remindAfter).toISOString()}`
      );
      return;
    }
  }
  // Dispatch to renderer; the React dialog handles user consent. We never
  // auto-download — the user must click "Install on next restart" first.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:available", { version });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("[electron] update downloaded successfully:", info?.version);
  // Arm install-on-quit rather than prompting for a restart. Users who
  // clicked "Install on next restart" accept exactly that contract; an
  // immediate-restart prompt would violate the "never auto-restart" AC.
  autoUpdater.autoInstallOnAppQuit = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:downloaded", { version: info?.version });
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

autoUpdater.on("error", (err) => {
  // Don't show dialog to user - just log it
  log.error("[electron] AutoUpdater error:", err);
});

app.on("before-quit", () => {
  log.info("[electron] terminating Python process before app quits...");
  stopHealthSupervisor();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  if (tileServerHandle && tileServerHandle.port) {
    tileServerHandle.close().catch(() => {});
    tileServerHandle = NOOP_TILE_SERVER;
  }
  cleanupPython();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// extra safety: handle crashes / signals
process.on("uncaughtException", (err) => {
  log.error("[electron] uncaughtException:", err);
  cleanupPython();
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  log.error("[electron] unhandledRejection:", reason);
  cleanupPython();
  app.quit();
});

process.on("SIGINT", () => {
  log.info("[electron] SIGINT received");
  cleanupPython();
  app.quit();
});

process.on("SIGTERM", () => {
  log.info("[electron] SIGTERM received");
  cleanupPython();
  app.quit();
});
