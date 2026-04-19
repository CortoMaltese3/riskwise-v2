const { app, BrowserWindow, ipcMain, session, shell, dialog } = require("electron");
const { autoUpdater, NsisUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const log = require("electron-log");

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
  "img-src 'self' data: blob: file:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
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
    updateLoaderMessage("RISK WISE Engine is missing. Downloading...");

    // Use electron's net module
    const { net } = require("electron");
    const engineUrl =
      "https://github.com/gkalomalos/ERA-Project_RISK-WISE/releases/download/v1.0.6/RiskWiseEngine.zip";

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
    if (!url.startsWith("file://")) {
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

  // Configure auto-updater BEFORE any other startup logic
  if (!isDevelopmentEnv()) {
    try {
      log.info("[electron] configuring auto-updater...");

      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.allowDowngrade = false;
      autoUpdater.allowPrerelease = false;

      autoUpdater.setFeedURL({
        provider: "github",
        owner: "gkalomalos",
        repo: "ERA-Project_RISK-WISE",
        releaseType: "release",
      });

      if (NsisUpdater.prototype.verifySignature) {
        NsisUpdater.prototype.verifySignature = async () => null;
        log.warn("[electron] Signature verification disabled (self-signed certificate)");
      }

      log.info(
        "[electron] auto-updater configured (autoDownload=false, autoInstallOnAppQuit=false)"
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

  // Check for updates AFTER main window is created
  if (!isDevelopmentEnv()) {
    try {
      log.info("[electron] checking for updates...");
      autoUpdater.checkForUpdates().catch((err) => {
        log.error("[electron] updater check failed:", err);
      });
    } catch (error) {
      log.error("[electron] failed to check for updates:", error);
    }
  }
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

const randomErrorId = () => {
  const { randomUUID } = require("crypto");
  return randomUUID();
};

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

const httpRequest = async (method, path, body, requestId) => {
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
    mainWindow.loadFile(path.join(basePath, "build", "index.html"));

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

autoUpdater.on("update-available", async (info) => {
  log.info("[electron] update available:", info?.version);

  try {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `A new version (${info?.version ?? "unknown"}) is available. Download now?`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      log.info("[electron] user accepted download");
      autoUpdater.downloadUpdate().catch((err) => {
        log.error("[electron] downloadUpdate failed:", err);
        dialog.showErrorBox("Update Error", "Failed to download update: " + err.message);
      });
    } else {
      log.info("[electron] user declined download - will prompt on next start");
    }
  } catch (error) {
    log.error("[electron] failed to show update dialog:", error);
  }
});

autoUpdater.on("update-downloaded", async () => {
  log.info("[electron] update downloaded successfully");

  try {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update Ready",
      message: "Update has been downloaded. Restart now to install?",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      log.info("[electron] user accepted installation - restarting");
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    } else {
      log.info("[electron] user declined installation - will prompt on next start");
      // User chose "Later" - the update stays cached and will be prompted again on next launch
      // No need to clear cache here - electron-updater handles re-prompting
    }
  } catch (error) {
    log.error("[electron] failed to show update ready dialog:", error);
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
