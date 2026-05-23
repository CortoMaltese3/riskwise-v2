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

## Diagnostics bundle

The **Settings → Diagnostics** panel exposes two ways to share the same
sanitized bundle. Both produce a ZIP with exactly these contents:

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

### Send to Support (primary)

The **Send to Support** button uploads the same bundle as an attachment
on a single Sentry event, plus an optional message and reply email you
provide on click. **Clicking Send is consent for that one upload only.**
Your persisted auto-Sentry setting (see "Continuous crash reporting"
below) is independent and is not changed by clicking Send.

Send is disabled, with an inline hint, under any of these conditions:

1. The build has no `SENTRY_DSN` configured (dev builds and forks).
2. **Offline mode is active.**

When Send is disabled, the Export button still works.

### Export Diagnostics (secondary)

The **Export Diagnostics** button writes the same ZIP to disk and prompts
you for a save location. Nothing leaves your machine — you choose whether
and where to share the file. The default save path is your Desktop.

## Continuous crash reporting (opt-in)

Continuous crash reporting is the **Advanced** opt-in shown in the
Diagnostics panel. It is independent from "Send to Support" — most users
should reach for the manual Send button first; this toggle is for power
users and beta testers who want every crash captured automatically.

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

### Breadcrumbs

When continuous reporting is armed (or "Send to Support" is clicked),
each Sentry event carries up to ~100 **breadcrumbs**: short log-line
records from the run leading up to the event. Breadcrumbs let a support
engineer see the same pre-crash log trail in the Sentry web UI that
would otherwise require downloading and unzipping the diagnostics bundle.

The breadcrumbs are populated by:

- The Electron main process — every `electron-log` line at
  `SENTRY_BREADCRUMB_LEVEL` (default `INFO`) and above, including
  renderer-side records that flow through the existing `log:renderer`
  IPC channel.
- The Python backend — every `logging.getLogger(...)` line at the same
  level, via `sentry_sdk.integrations.logging.LoggingIntegration`. The
  structlog pipeline in `backend/logging_config.py` mirrors structured
  records into stdlib `logging` so they reach the integration.

Breadcrumb content is the same log-line text already written to the
on-disk log files documented under "What is logged locally" — sending
them as breadcrumbs is **not** a new privacy surface. The runtime gates
in "Continuous crash reporting" apply unchanged: no DSN, no consent, or
offline mode → the event is dropped before transmission and the
breadcrumbs ride it into oblivion. To raise the floor, set
`SENTRY_BREADCRUMB_LEVEL=WARN` (or `ERROR`) in `.env` or the build env.

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

The Sentry init, three-gate decision, ZIP builder, and one-shot upload
live in:

- [`public/electron.js`](../public/electron.js) — `initializeSentry`,
  `getSentryStatus`, `exportDiagnostics`, `uploadDiagnosticsToSentry`.
- [`public/diagnostics.js`](../public/diagnostics.js) — log collection,
  ZIP writer (disk + in-memory variants).
- [`src/components/settings/DiagnosticsSection.jsx`](../src/components/settings/DiagnosticsSection.jsx) —
  Settings panel UI, Send/Export controls, and the Advanced collapsible
  for continuous reporting.

The CI build job sets `SENTRY_DSN` from a GitHub Actions secret of the
same name; the value is written to `build/sentry-dsn.json` by
[`scripts/write-sentry-dsn.js`](../scripts/write-sentry-dsn.js) and
never appears in source.

[1]: https://docs.sentry.io/platforms/javascript/guides/electron/
