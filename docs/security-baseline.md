# Security Baseline Audit — v1 Electron

**Date:** 2026-04-17  
**Scope:** `public/electron.js`, `public/preload.js`, `index.html`, `public/loader.html`, `backend/`  
**Electron version:** 41.2.1  

---

## 1. `webPreferences` Audit

### Main window (`createMainWindow`, `electron.js:418–440`)

| Setting | Value | Assessment |
|---|---|---|
| `contextIsolation` | `true` | ✓ Correct |
| `nodeIntegration` | `false` | ✓ Correct |
| `sandbox` | `true` | ✓ Correct |
| `webSecurity` | `true` | ✓ Correct |
| `enableRemoteModule` | `false` | ✓ Correct |
| `webviewTag` | not set (defaults `false` in Electron 14+) | ✓ Acceptable |
| `preload` | `path.join(basePath, "build", "preload.js")` | ✓ Correct |

**Finding:** The main window `webPreferences` are well-hardened. No issues.

### Loader window (`createLoaderWindow`, `electron.js:354–373`)

| Setting | Value | Assessment |
|---|---|---|
| `nodeIntegration` | `false` | ✓ Correct |
| `contextIsolation` | not set (defaults `true` in Electron 12+) | ✓ Acceptable (Electron 41) |
| `sandbox` | not set (defaults `true` in Electron 20+) | ✓ Acceptable (Electron 41) |

**Finding:** Acceptable — modern Electron defaults cover the missing values.

---

## 2. Content Security Policy

### Main window (`index.html:12–24`)

```
default-src 'self';
base-uri 'self';
object-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: file: https:;
font-src 'self' data:;
connect-src 'self' blob: https:;
worker-src 'self' blob:;
```

### Loader window (`public/loader.html:6–15`)

```
default-src 'self';
base-uri 'self';
object-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: file:;
```

**Findings:**

| # | Directive | Issue | Severity |
|---|---|---|---|
| CSP-1 | `style-src 'unsafe-inline'` | Permits inline styles. Required by MUI runtime style injection; not trivially removable. Enables CSS-based data exfiltration if an attacker can inject HTML. | **Medium** |
| CSP-2 | `img-src file:` | Allows `<img src="file:///...">`, which can be used to probe local filesystem paths via timing or error events. | **Medium** |
| CSP-3 | `connect-src https:` | Permits `fetch`/XHR to any HTTPS endpoint. Restricting to known origins (update server, CDN) would reduce exfiltration surface. | **Low** |
| CSP-4 | `img-src https:` | Permits images from any HTTPS origin. Low risk but widens the attack surface. | **Low** |
| CSP-5 | Meta-tag delivery only | CSP is enforced via `<meta http-equiv>`, not an HTTP response header. Sufficient for Electron file-origin content; `executeJavaScript` from main process bypasses it. | **Info** |
| CSP-6 | No `unsafe-eval` | `unsafe-eval` absent from `script-src` — correct. | ✓ |
| CSP-7 | No `unsafe-inline` in `script-src` | Inline script execution blocked — correct. | ✓ |

---

## 3. `preload.js` Surface Map

Two namespaces are exposed via `contextBridge.exposeInMainWorld`:

### `window.electron` (`preload.js:3–20`)

| API | IPC channel | Notes |
|---|---|---|
| `clearTempDir()` | `clear-temp-dir` (invoke) | Triggers Python temp-dir clear |
| `fetchTempDir()` | `fetch-temp-dir` (invoke) | Returns app temp path |
| `fetchReportDir()` | `fetch-report-dir` (invoke) | Returns app report path |
| `isDevelopmentEnv()` | `is-development-env` (invoke) | Returns `!app.isPackaged` |
| `on(channel, cb)` | any channel (listener) | **CRITICAL** — no channel whitelist; renderer can subscribe to any IPC event |
| `remove(channel, cb)` | any channel | **CRITICAL** — renderer can remove any IPC listener |
| `send(channel, data)` | any channel (send) | **HIGH** — renderer can send to any `ipcMain.on` handler (shutdown, reload, minimize) |
| `saveScreenshot(blob, filePath)` | `save-screenshot` (invoke) | Renderer controls write path |
| `onSaveScreenshotReply(cb)` | `save-screenshot-reply` (on) | |
| `copyFile(src, dest)` | `copy-file` (invoke) | Renderer controls both paths |
| `onCopyFileReply(cb)` | `copy-file-reply` (on) | |
| `copyFolder(src, dest)` | `copy-folder` (invoke) | Renderer controls both paths |
| `onCopyFolderReply(cb)` | `copy-folder-reply` (on) | |
| `openReport(reportPath)` | `open-report` (invoke) | Renderer controls path passed to `shell.openPath` |

### `window.api` (`preload.js:22–26`)

| API | IPC channel | Notes |
|---|---|---|
| `runPythonScript({ scriptName, data })` | `runPythonScript` (invoke) | `scriptName` is dispatched through a server-side allowlist in `app.py:49–90` |

**Findings:**

| # | Issue | Severity |
|---|---|---|
| PRE-1 | `on(channel, cb)` and `send(channel, data)` accept arbitrary channel names | **HIGH** — renderer can call `send("shutdown")`, `send("reload")` or subscribe to any main-process event without restriction. These should use an explicit allowlist. |
| PRE-2 | `copyFile`, `copyFolder`, `saveScreenshot`, `openReport` accept renderer-controlled paths | **HIGH** — see §5 (path traversal). |
| PRE-3 | `window.api.runPythonScript` dispatches through server-side allowlist | ✓ Mitigated — `app.py` rejects unknown script names. |

---

## 4. `shell.openExternal` Assessment

**Finding:** No `shell.openExternal` calls exist anywhere in the codebase. The only external-open API in use is `shell.openPath(reportPath)` at `electron.js:679`, which opens a local file.

`shell.openPath` is safer than `shell.openExternal` for local paths but the `reportPath` argument is renderer-supplied with no validation (see §5).

---

## 5. User-Supplied File Paths

### IPC handlers (`electron.js`)

| Handler | Path source | Normalisation | Risk |
|---|---|---|---|
| `save-screenshot` (line 626) | `filePath` from renderer | None | Renderer can write any file at any path |
| `copy-file` (line 663) | `sourcePath`, `destinationPath` from renderer | None | Renderer can copy any file to any path |
| `copy-folder` (line 643) | `sourceFolder`, `destinationFolder` from renderer | None | Renderer can copy any directory tree |
| `open-report` (line 677) | `reportPath` from renderer | None | Renderer can open any local file via shell |

**Finding (FS-1) — CRITICAL:** None of the four file-operation IPC handlers validate or normalise renderer-supplied paths. A compromised renderer (e.g., via an XSS in a React component) can:
- Write arbitrary files anywhere on the filesystem via `save-screenshot` or `copy-file`.
- Read arbitrary files via `copy-file` (source) or `copy-folder`.
- Trigger execution of arbitrary local files via `open-report` → `shell.openPath`.

Mitigation: constrain all paths to known prefixes (temp dir, reports dir) using `path.resolve()` + prefix check before any `fs` operation.

### Backend Python (`entity_handler.py`)

At `entity_handler.py:96`:
```python
entity_filepath = DATA_ENTITIES_DIR / filepath
entity = Entity.from_excel(entity_filepath)
```

`filepath` originates from the scenario request data passed from the renderer through the `runPythonScript` IPC bridge. There is no call to `os.path.realpath()` or prefix validation before the path is used.

**Finding (FS-2) — HIGH:** A `filepath` value like `../../sensitive_file.xlsx` would resolve to a path outside `DATA_ENTITIES_DIR`. The same pattern appears in `hazard_handler.py` (via `run_scenario.py:345,357,565,580,602`).

Mitigation: normalise with `pathlib.Path.resolve()` and assert the result starts with `DATA_ENTITIES_DIR.resolve()` before use.

---

## 6. Excel File Size Limits

Searched all Excel-loading paths in the backend:

- `entity_handler.py:97` — `Entity.from_excel(entity_filepath)` — **no size check before parsing**
- `hazard_handler.py` — uses CLIMADA `Hazard.from_excel()` equivalents — **no size check**
- `costben_handler.py`, `macroeconomic_handler.py`, `report_handler.py` — Excel I/O — **no size checks found**
- No `MAX_FILE_SIZE` constant in `constants.py`
- No middleware or validation layer enforcing limits

**Finding (XL-1) — HIGH:** No maximum file size is enforced before parsing user-supplied Excel files. A crafted zip-bomb (e.g., a valid `.xlsx` that expands to gigabytes of data) will be fully parsed in memory. CLIMADA's `openpyxl` / `xlrd` parsers do not have built-in decompression limits.

Mitigation: check `os.path.getsize(filepath)` before calling any Excel parser; reject files above a configurable threshold (e.g., 50 MB).

---

## 7. `electron-fuses` Current State

`@electron/fuses` 1.8.0 is present in `package-lock.json` as a transitive dependency, but:
- No `afterSign` or `afterPack` hook is configured in `package.json` → `build`.
- No custom build script applies `flipFuses`.
- No `electron-builder` plugin that calls the fuses CLI is configured.

**Finding (FUS-1) — HIGH:** All Electron fuses are at their **factory defaults** for Electron 41. Default fuse state for relevant fuses:

| Fuse | Default in Electron 41 | Recommended |
|---|---|---|
| `RunAsNode` | **enabled** | disabled — allows running as plain Node.js via `ELECTRON_RUN_AS_NODE=1` |
| `EnableCookieEncryption` | disabled | enabled |
| `EnableNodeOptionsEnvironmentVariable` | **enabled** | disabled — allows `NODE_OPTIONS` to inject code |
| `EnableNodeCliInspectArguments` | **enabled** | disabled — allows debugger attachment |
| `EnableEmbeddedAsarIntegrityValidation` | disabled | enabled (requires asar — see FUS-2) |
| `OnlyLoadAppFromAsar` | disabled | enabled (requires asar — see FUS-2) |
| `LoadBrowserProcessSpecificV8Snapshot` | disabled | n/a |

**Finding (FUS-2) — HIGH:** `"asar": false` in `package.json → build`. ASAR is disabled, so `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` cannot be enabled. App files are unpacked on disk and can be tampered with after installation.

**Finding (FUS-3) — MEDIUM:** Code signing is disabled (`"forceCodeSigning": false`). Windows builds are unsigned.

---

## 8. Auto-Update Signature Verification

At `electron.js:261–262`:
```js
NsisUpdater.prototype.verifySignature = async () => null;
log.warn("[electron] Signature verification disabled (self-signed certificate)");
```

**Finding (UPD-1) — HIGH:** Update package signature verification is explicitly monkey-patched to a no-op. Any update served from the GitHub release endpoint that matches the version check will be installed without signature validation. If the GitHub repo or CDN is compromised, a malicious update will be silently installed.

---

## 9. Severity-Ranked Findings

| ID | Severity | Title | Location |
|---|---|---|---|
| FS-1 | **Critical** | No path validation in IPC file handlers — arbitrary file read/write/exec | `electron.js:626,643,663,677` |
| PRE-1 | **High** | `send()` and `on()` in preload accept any IPC channel — renderer can invoke shutdown/reload | `preload.js:8–10` |
| FS-2 | **High** | Path traversal in Python file loading — `../` in entity/hazard filenames | `entity_handler.py:96`, `hazard_handler.py` |
| XL-1 | **High** | No Excel file size limit — zip-bomb attack surface | All Excel loaders in `backend/` |
| FUS-1 | **High** | Electron fuses at defaults — `RunAsNode`, `NodeOptions`, `NodeCliInspect` enabled | `package.json` build config |
| FUS-2 | **High** | ASAR disabled — app files unprotected on disk | `package.json: "asar": false` |
| UPD-1 | **High** | Auto-update signature verification disabled | `electron.js:261–262` |
| CSP-1 | **Medium** | `unsafe-inline` in `style-src` | `index.html:18`, `loader.html:11` |
| CSP-2 | **Medium** | `file:` in `img-src` — local filesystem probing via image requests | `index.html:19` |
| FUS-3 | **Medium** | Windows builds unsigned | `package.json: "forceCodeSigning": false` |
| CSP-3 | **Low** | `connect-src https:` permits XHR to any HTTPS origin | `index.html:21` |
| CSP-4 | **Low** | `img-src https:` permits images from any HTTPS origin | `index.html:19` |

---

## 10. Quick Wins (No Rewrite Required)

The following can be fixed in isolation without architectural changes:

1. **FUS-1 — Enable fuses** (`package.json` + new `afterPack.cjs`):  
   Add `@electron/fuses` flip step in `afterPack` to disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`. ~20 lines.

2. **UPD-1 — Remove signature bypass** (`electron.js:260–262`):  
   Delete the three lines that monkey-patch `verifySignature`. Requires a properly signed update package — or switching to an unsigned build flow that simply omits the check rather than actively disabling it.

3. **CSP-2 — Remove `file:` from `img-src`** (`index.html`):  
   Drop `file:` from `img-src`. Verify no component relies on `file://` image paths (unlikely — app loads assets from `build/`).

4. **FUS-2 / FUS-1 combo — Re-enable ASAR** (`package.json`):  
   Set `"asar": true`. Unlocks `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` fuses. May require adjusting paths where the app reads `__dirname` relative files.

5. **XL-1 — Add file size check** (`entity_handler.py`, `hazard_handler.py`):  
   Two lines before each `from_excel()` call: `if os.path.getsize(fp) > MAX_EXCEL_BYTES: raise ValueError(...)`.

6. **FS-2 — Path prefix check in Python** (`entity_handler.py:96`):  
   `resolved = (DATA_ENTITIES_DIR / filepath).resolve(); assert str(resolved).startswith(str(DATA_ENTITIES_DIR.resolve()))`.

Items requiring more careful refactoring (Phase 1 hardening):
- **FS-1** — Requires adding validation to all four IPC handlers. Each needs a trusted prefix check.
- **PRE-1** — Requires replacing the generic `send`/`on` API with a channel allowlist in `preload.js` and corresponding `ipcMain` changes.
