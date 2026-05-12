# Accessibility — RISK WISE

**Standard:** WCAG 2.1 AA
**Last tested:** 2026-04-25 (Issue #121)
**Tested AT:** NVDA 2024.4 + Chrome / Electron 41 on Windows 11

## Conformance statement

**RISK WISE conforms to WCAG 2.1 Level AA** as of the Phase 4 conformance pass
(issue #121). Many government procurement contexts in the project's deployment
regions require this baseline, so accessibility is a release-blocking concern
rather than a polish item.

The baseline audit at [`../audits/accessibility-baseline-v1.md`](../audits/accessibility-baseline-v1.md)
catalogues the original v1 violations. The Phase 3 work (Area 16, issue #85)
fixed the structural and keyboard-navigation gaps; the Phase 4 work documented
here closes contrast, RTL, and conformance-statement loops.

| Criterion family | Status |
|---|---|
| 1.1 Text alternatives | ✅ Conformant — informational images carry descriptive `alt`; decorative SVGs are `aria-hidden` |
| 1.3 Adaptable (landmarks, structure) | ✅ Conformant — `banner`, `navigation`, `main`, `complementary` landmarks in `AppShell` |
| 1.4 Distinguishable (focus, contrast) | ✅ Conformant — every text/background token in `src/theme/theme.ts` clears AA; gated by `npm run lint:contrast` |
| 2.1 Keyboard accessible | ✅ Conformant — golden path completable via Tab/Shift+Tab/Enter/Space (see §Keyboard walkthrough); gated by `tests/e2e/a11y.spec.ts` |
| 2.4 Navigable (focus order, page titled) | ✅ Conformant — focus order matches DOM order; modals trap focus and return focus to the trigger on close |
| 3.1 Readable (lang/dir) | ✅ Conformant — `<html lang>` and `<html dir>` track the active locale via `applyDocumentDirection` (`src/i18nConfig.js`) |
| 4.1 Compatible (name, role, value) | ✅ Conformant — every icon-only `<IconButton>` has `aria-label`; landmarks labelled; gated by `tests/e2e/a11y.spec.ts` |
| 4.1.3 Status messages | ✅ Conformant — progress overlay uses `aria-live="polite"`; error toasts use `aria-live="assertive"` |

### Known third-party limitations

These are libraries we depend on whose accessibility output we cannot fully
control without forking. They are documented here per WCAG conformance
guidance and tracked for future engagement with upstream maintainers:

- **Chart.js** — chart canvases expose a single `<canvas>` element with no
  underlying data table. We mitigate by rendering an adjacent
  `data-table` view (issue #84) and an `aria-label` summary on the canvas
  for screen-reader users; full canvas keyboard accessibility is not
  feasible without the upstream `chartjs-a11y` plugin landing in 5.x.
- **Leaflet** — map markers and tile layers are rendered to a `<div>`
  hierarchy that is not in the accessibility tree. We mitigate by exposing
  every map control as a labelled `<button>` and by serving the same data
  through the results table. Map content (hazard intensity at lat/lng) is
  not screen-reader-accessible; users requiring this view should consume
  the exported PDF report or the workspace data table.

Issues that touch these limitations should reference this section rather than
re-litigating the third-party constraint.

## What the gate enforces

- **`npm test`** runs the `tests/a11y/` Vitest suite, which renders every
  primary screen — Home, Risk Assessment, Workspace (populated + empty),
  Settings (every panel: Custom Data, CRED Data, Measures, Updates, Offline,
  Diagnostics, About), and Macro Analysis — and asserts that `axe-core`
  reports **zero** violations at severity `critical` or `serious` against
  the `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa` rule sets. A failing
  rule prints both the rule id and the offending CSS selector so CI logs
  point straight at the regression.
- **`npm run lint:contrast`** (`scripts/check-color-contrast.mjs`) computes
  the WCAG 2.1 contrast ratio for every text/background token pair declared
  in `src/theme/theme.ts` and fails CI with the failing pair and measured
  ratio. Thresholds: 4.5:1 for normal text, 3:1 for large text. The list of
  pairs lives next to the pair-name comments in the script and must be
  updated when a new palette slot is added.
- **`npm run test:e2e`** runs the Playwright suite, including
  `tests/e2e/a11y.spec.ts` (focus-trap return, keyboard golden path,
  icon-only-button audit, label-not-placeholder audit) and
  `tests/e2e/rtl.spec.ts` (Arabic locale flips `<html dir>`/`<html lang>`
  and mirrors the sidebar to the right edge of the viewport).
- The `color-contrast` rule is disabled in the jsdom axe runs because the
  engine cannot compute contrast without a real browser. Contrast is
  instead enforced by `lint:contrast` (token level, deterministic) and the
  Playwright suite (rendered output, `axe-playwright` follow-up tracked).
- The eslint config (`eslint.config.mjs`) bans raw hex literals outside
  `src/theme/` so contrast changes are systematic and lint-checkable.

A failing axe, contrast, or Playwright check fails CI. Suppressing a rule
must be done in code with a comment linking to the tracking issue.

## ARIA landmarks

| Landmark | Component | Notes |
|---|---|---|
| `banner` | `TopBar` (`AppBar`) | Labelled by `application_title` |
| `navigation` | `Sidebar` (inner `<nav>` Box) | Labelled by `sidebar_aria_primary_nav` |
| `main` | `AppShell` (`<main>` Box) | `id="main-content"` for future skip-link target |
| `complementary` | Risk Assessment results panel (`<aside>`) | Labelled "Results" |

## Live regions

| Element | Politeness | Why |
|---|---|---|
| `ScenarioProgressChip` step label | `polite` | Status updates during scenario run; do not interrupt |
| Error `Snackbar` (severity `error`) | `assertive` | User must be notified immediately of failure |
| Non-error `Snackbar` (info/success/warning) | `polite` | Background acknowledgement |

## Focus management

- Visible focus rings are applied globally via the MUI v7 theme override
  `MuiButtonBase.styleOverrides.root['&:focus-visible']` in
  [`src/theme/theme.ts`](../../src/theme/theme.ts).
- All `<Dialog>` and `<Drawer>` instances rely on MUI's built-in focus
  trap. None override `disableEnforceFocus` (verified via `grep`); the
  Playwright a11y spec asserts that Tab cycles within the active modal and
  that Escape returns focus to the original trigger.

## Keyboard walkthrough — Risk Assessment golden path

The following sequence completes the Risk Assessment golden path with
keyboard only (Tab to advance, Shift+Tab to retreat, Enter/Space to activate).
Run through `npm run dev` after any change that touches input cards or the
sidebar.

1. **Page load** — first Tab moves focus to the sidebar collapse button.
2. **Sidebar** — Tab cycles through Home → Risk Assessment → Macroeconomic →
   Workspace → Settings; Enter selects.
3. **Top bar** — Tab continues through Theme → Language → Minimize → Shutdown.
4. **Country / Hazard / Scenario / TimeHorizon cards** — each card is now a
   `<Button>` (M-4 fix in baseline); Tab reaches every card; Enter/Space
   selects.
5. **Run scenario** — Tab to the run button; Enter starts the run. Status is
   announced via the `ScenarioProgressChip` `aria-live="polite"` step label.
6. **Cancel** — focus the chip's Cancel button (two-stage confirm); the chip
   does not trap focus, so Tab continues through the rest of the app.
7. **Results panel** — once the run completes, Tab continues into the
   `complementary` results panel.

If a step is unreachable, file an issue tagged `accessibility` with the step
number and the offending component.

## NVDA smoke test script (manual, before each release)

NVDA is the reference assistive technology for the Windows Electron build.
Run this script with NVDA + the latest packaged installer (`npm run dist`)
on a Windows 11 machine before every minor / major release. The expected
announcements below describe what NVDA *should* read at each step; if a
step diverges, file an `accessibility` issue with the step number, the
divergence, and a screen recording.

### Setup

1. Install NVDA 2024.4 (or later) from <https://www.nvaccess.org/>.
2. Install RISK WISE from the latest signed Windows installer.
3. Launch NVDA (`Ctrl+Alt+N`); confirm the speech viewer is open
   (`NVDA + n` → *Tools* → *Speech viewer*) so the tester can copy-paste
   announcements into the issue if a step fails.
4. Launch RISK WISE. Locale defaults to English; the script that follows is
   the English golden path. (For the Arabic walkthrough, switch via the
   language menu after step 1 and repeat from step 2.)

### Steps and expected announcements

Each step is *one* user input. The expected announcement is the exact
substring NVDA should read. Where the announcement contains a translated
label, the English source is given; the Arabic build will read the
translated equivalent.

| # | User input | Expected NVDA announcement |
|---|-----------|----------------------------|
| 1 | App launch (focus seeded by Electron) | "RISK WISE — application" + main heading "Welcome to RISK WISE" |
| 2 | `Tab` | "navigation, Primary navigation" then "Home, button, selected, current page" |
| 3 | `Down arrow` (or `Tab`) | "Risk Assessment, button" |
| 4 | `Enter` | Region change announced: "main, Main content"; first focusable item announced |
| 5 | `Tab` until "Country, combo box" | "Country, combo box, has popup, collapsed" |
| 6 | `Enter`, then type "Egy" | "Egypt, 1 of 1" |
| 7 | `Enter` | "Country, combo box, Egypt, collapsed" |
| 8 | `Tab` to Hazard combo, `Enter`, type "Flo", `Enter` | "Hazard, combo box, Flood, collapsed" |
| 9 | `Tab` to "Run" button, `Enter` | "Run, button, pressed"; then `aria-live="polite"` step labels: "Loading hazard data…", "Computing impact…" |
| 10 | After progress overlay closes | Map region announced; results panel landmark "complementary, Results" reads its heading |
| 11 | `Tab` until "Save scenario, button", `Enter` | Dialog opens: "Save scenario, dialog"; first focusable field "Scenario name, edit" |
| 12 | Type a name, `Tab` to "Save", `Enter` | Dialog closes; toast announced via `aria-live="polite"`: "Scenario saved" |
| 13 | `Tab` back to navigation, `Down arrow` to "Workspace", `Enter` | Region change; table announced: "table, Scenarios, 1 row, 6 columns"; first row reads its scenario name |
| 14 | `Escape` (with no modal open) | No-op; focus stays put |

### Pass criteria

A test pass is **all 14 steps announce as written**, with no silent focus
changes and no element announced as just "button" or "edit" without a
label. A single divergence is a **release blocker** until triaged.

### Recording test results

Capture each test run in a new dated entry below the most recent one in
`docs/audits/accessibility-baseline-v1.md` §4. Keep the latest 3 runs in
that file; older runs roll off into git history.

## Out of scope (tracked elsewhere)

- JAWS and VoiceOver walkthroughs — RISK WISE ships Windows-only as of
  v1.x; cross-platform AT support is tracked when a macOS build lands.
- Chart canvas keyboard interactivity — see "Known third-party limitations"
  above; tracked in #84 / #97.
- Full Chromium-based axe scan via `axe-playwright` — staged for a follow-up
  once the base Playwright suite is stable on CI.
