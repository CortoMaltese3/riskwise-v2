# Privacy and diagnostics

RISK WISE is a desktop application that runs entirely on your machine. The
sections below explain exactly what is logged locally, what crash-report
information is sent to our error-tracking service when you opt in, and
what is *never* sent.

This is the canonical reference for issue #119 (Area 17). The Settings →
Diagnostics panel links here.

## What is logged locally

The app writes structured logs to two locations on disk. Both are
file-only — nothing leaves your machine.

- **Electron main process** — `%APPDATA%/RISK WISE/logs/app-YYYY-MM-DD.log`
  (Windows). Contains startup events, IPC calls, auto-update checks, and
  errors from the Electron host. Files older than 7 days are pruned
  automatically.
- **Python backend** — `%APPDATA%/RISK WISE/logs/` (same folder).
  Contains scenario request IDs, CLIMADA Client API calls, and engine
  errors. Same 7-day retention.

Each log line includes a request ID so a given scenario run can be
correlated across the renderer, Electron main, and Python backend
layers. Scenario *parameters* (country, hazard, year ranges) appear in
log lines so a support engineer can reproduce issues; scenario *results*
(impact rasters, exposure values) do not.

## Export Diagnostics

The **Settings → Diagnostics → Export Diagnostics** button packages the
following into a single ZIP and prompts you for a save location:

- Electron main logs from the last 7 days.
- Python backend logs from the last 7 days.
- A `system-info.json` with: OS platform/release/arch, CPU model and
  core count, total/free memory, free disk space, app version, engine
  version, release channel, and the resolved Sentry status.
- A `scenarios.json` with the last 5 scenario metadata rows
  (`scenario_id`, `country`, `hazard`, `computed_at`). Scenario *inputs*
  (uploaded exposure files) and *outputs* (impact rasters) are **not**
  included.
- A `README.txt` describing the bundle.

The ZIP is **never auto-uploaded**. It is written to disk and you choose
whether and where to share it. The default save path is your Desktop.

## Sentry crash reporting (opt-in)

If you opt in on first launch, the Electron main process initializes
[`@sentry/electron`][1] and reports unhandled exceptions and crashes to
our error-tracking service. The reports include:

- The crash stack trace.
- App version and OS version (so we can correlate crashes with releases).
- A small set of breadcrumbs from `electron-log` (timestamps + log
  message text from the same process).

Reports do **not** include:

- Scenario data, inputs, results, or any uploaded files.
- File paths under `%USERPROFILE%` or any other user-home folder.
- Email addresses, names, or other personally identifiable information.
- The contents of `riskwise.db`.
- The DSN itself is never exposed to the renderer process.

Sentry is **disabled** under any of these conditions, regardless of
your consent choice:

1. The build has no `SENTRY_DSN` configured (dev builds and forks).
2. **Offline mode is active** (Settings → Offline). When offline mode
   is on, the Diagnostics panel shows "Crash reporting disabled in
   offline mode".
3. You opted out (or have not yet been prompted).

### How to opt in or out

- **First launch** — a one-time dialog asks "Help improve RISK WISE by
  sending anonymous crash reports?" with **Yes, opt in** /
  **No thanks**. Your choice persists in `electron-store` (a JSON file
  in `%APPDATA%/RISK WISE/`).
- **Later** — Settings → Diagnostics has explicit *Opt in* and *Opt out*
  buttons. A consent change takes full effect on the next app launch
  (an in-flight Sentry client cannot be cleanly torn down mid-session).
- **Factory reset** — clearing `%APPDATA%/RISK WISE/` resets your choice
  and you'll be prompted again on next launch.

## Where to read the source

The Sentry init, three-gate decision, and ZIP builder live in:

- [`public/electron.js`](../public/electron.js) — `initializeSentry`,
  `getSentryStatus`, `exportDiagnostics`.
- [`public/diagnostics.js`](../public/diagnostics.js) — log collection
  and ZIP writer.
- [`src/components/Settings/DiagnosticsSection.jsx`](../src/components/Settings/DiagnosticsSection.jsx) —
  Settings panel UI and consent dialog.

The CI build job sets `SENTRY_DSN` from a GitHub Actions secret of the
same name; the value is written to `build/sentry-dsn.json` by
[`scripts/write-sentry-dsn.js`](../scripts/write-sentry-dsn.js) and
never appears in source.

[1]: https://docs.sentry.io/platforms/javascript/guides/electron/
