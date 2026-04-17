# Accessibility Baseline — RISK WISE v1

**Date:** 2026-04-17  
**Auditor:** Spike #9 static analysis + axe-core automated scan  
**Standard:** WCAG 2.1 AA  
**Scope:** v1 codebase, English locale unless stated otherwise

---

## 1. Automated Scan — axe-core

### Setup

`@axe-core/react` is wired into `src/main.jsx` under `import.meta.env.DEV`.
It fires 1 second after mount and logs violations to the browser DevTools console.
Run `npm run dev` → open DevTools Console → filter by `axe` to see live results.

### Method

`axe.run()` restricted to `wcag2a` and `wcag2aa` rule tags was executed against
the rendered `NavigateAlert` (launch screen) in a jsdom environment via Vitest.

### Results — Launch screen (`NavigateAlert`)

| Impact | Count |
|--------|-------|
| Critical | 0 |
| Serious | 0 |
| Moderate | 0 (jsdom cannot evaluate contrast) |
| Minor | 0 |

**Note:** jsdom has limited CSS support and reports zero contrast violations even
when colours fail WCAG. Contrast findings are captured under §2 (Static Analysis).
For a full automated scan with contrast, run axe inside Chromium via Playwright
(tracked for Phase 3 Area 16 work).

---

## 2. Static Code Analysis — Known Violations

The following issues were identified by reading the v1 source. They are grouped by
WCAG success criterion and ordered by severity.

### 2.1 Critical

None identified through static analysis.

### 2.2 Serious

#### S-1 — Language attribute not updated on locale change
**File:** [index.html](../index.html), [src/components/nav/LanguageButton.jsx](../src/components/nav/LanguageButton.jsx)  
**Criterion:** WCAG 3.1.1 Language of Page (Level A)  
**Detail:** `<html lang="en">` is hardcoded. Switching to Arabic or Thai via
`LanguageButton` calls `i18n.changeLanguage()` but never updates
`document.documentElement.lang` or `document.documentElement.dir`. Screen readers
announce content in the wrong language and RTL layout is never applied.

#### S-2 — Document direction never set for RTL locale
**File:** [src/components/nav/LanguageButton.jsx](../src/components/nav/LanguageButton.jsx)  
**Criterion:** WCAG 1.3.4 Orientation (Level AA); CSS logical-property layout  
**Detail:** `document.documentElement.dir` is never set to `"rtl"` when the user
selects Arabic. The `bidiIsolate` post-processor in `i18nConfig.js` inserts Unicode
BiDi characters around translated strings, but flex/grid layout, icon directions,
progress bar fills, and chart axes all remain in LTR order.

#### S-3 — `LanguageButton` icon button has no accessible name
**File:** [src/components/nav/LanguageButton.jsx](../src/components/nav/LanguageButton.jsx:8)  
**Criterion:** WCAG 4.1.2 Name, Role, Value (Level A)  
**Detail:** `<IconButton>` renders only a `<LanguageIcon>` SVG with no `aria-label`
or visible label. Screen readers announce it as "button" with no purpose.

### 2.3 Moderate

#### M-1 — `aria-labelledby` IDs do not resolve on `NavigateAlert` dialogs
**File:** [src/components/alerts/NavigateAlert.jsx](../src/components/alerts/NavigateAlert.jsx:56)  
**Criterion:** WCAG 4.1.2 Name, Role, Value  
**Detail:** Two MUI `<Dialog>` components carry `aria-labelledby` values that
point to non-existent IDs:
- Launch dialog: `aria-labelledby="navigate-modal-title"` vs `<DialogTitle id="navigate-dialog-title">`
- Verification dialog: `aria-labelledby="navigate-verification-modal-title"` vs `<DialogTitle id="navigate-verification-dialog-title">`  

The dialog role has no accessible name; screen readers fall back to reading the
full dialog body, which degrades experience but does not silence the dialog.

#### M-2 — Informational images have meaningless alt text
**File:** [src/components/nav/Header.jsx](../src/components/nav/Header.jsx:38)  
**Criterion:** WCAG 1.1.1 Non-text Content  
**Detail:** Both logos use the filename as alt text (`alt="giz_logo"`,
`alt="unu_ehs_logo"`). Should be descriptive (`"GIZ — Deutsche Gesellschaft für
Internationale Zusammenarbeit"`, `"UNU-EHS — United Nations University"`).

#### M-3 — Hardcoded foreground/background colour pairs with unverified contrast
**Files:** [src/components/nav/Header.jsx](../src/components/nav/Header.jsx),
[src/components/alerts/NavigateAlert.jsx](../src/components/alerts/NavigateAlert.jsx)  
**Criterion:** WCAG 1.4.3 Contrast (Minimum, Level AA)  
**Detail:** Colours are hardcoded without a design-token layer; no contrast was
systematically verified. High-risk pairs:
- `#F35A5A` background / white text (welcome title, verification warning)
- `#8fc3d1` AppBar background / `color="inherit"` icon buttons
- `#70ADB5` tab bar background / white tab labels
- `#3B919D` selected tab background / white label

Full contrast check requires a browser-based axe run (see §1 note).

#### M-4 — Interactive `Card` components not keyboard-operable
**File:** [src/components/input/Country.jsx](../src/components/input/Country.jsx)  
**Criterion:** WCAG 2.1.1 Keyboard (Level A)  
**Detail:** `Country` (and similar input cards: `Hazard`, `Scenario`, `TimeHorizon`)
attach `onClick` to a MUI `<Card>` which renders as `<div>`. These cards have no
`role="button"`, no `tabIndex`, and no `onKeyDown` handler, making them
unreachable by keyboard Tab/Enter/Space navigation.

#### M-5 — No skip-navigation link
**Files:** [index.html](../index.html), [src/App.jsx](../src/App.jsx)  
**Criterion:** WCAG 2.4.1 Bypass Blocks (Level A)  
**Detail:** There is no "Skip to main content" mechanism. Keyboard users must Tab
through the entire fixed AppBar and tab bar on every page load.

### 2.4 Minor

#### Mi-1 — `<Typography variant="h3">` in AppBar disrupts heading hierarchy
**File:** [src/components/nav/Header.jsx](../src/components/nav/Header.jsx:49)  
**Criterion:** WCAG 1.3.1 Info and Relationships  
**Detail:** The application title uses `variant="h3"` rendered as a `<div>`. Even
if semantically a heading were intended, there is no `<h1>` on any screen;
heading order jumps from nothing to h3 / h6.

#### Mi-2 — Loading/progress state not announced to assistive technology
**Files:** [src/components/loaders/LoadModal.jsx](../src/components/loaders/LoadModal.jsx)  
**Criterion:** WCAG 4.1.3 Status Messages (Level AA)  
**Detail:** The run-scenario progress modal updates a `progress` value in Zustand
but no `aria-live` region announces progress to screen-reader users.

---

## 3. Violation Summary

| ID | Impact | Criterion | Component |
|----|--------|-----------|-----------|
| S-1 | Serious | 3.1.1 | `index.html` / `LanguageButton` |
| S-2 | Serious | 1.3.4 | `LanguageButton` |
| S-3 | Serious | 4.1.2 | `LanguageButton` |
| M-1 | Moderate | 4.1.2 | `NavigateAlert` |
| M-2 | Moderate | 1.1.1 | `Header` |
| M-3 | Moderate | 1.4.3 | `Header`, `NavigateAlert`, `MainTabs` |
| M-4 | Moderate | 2.1.1 | `Country`, `Hazard`, `Scenario`, `TimeHorizon` |
| M-5 | Moderate | 2.4.1 | `index.html`, `App` |
| Mi-1 | Minor | 1.3.1 | `Header` |
| Mi-2 | Minor | 4.1.3 | `LoadModal` |

**Totals:** 0 critical / 3 serious / 5 moderate / 2 minor = **10 issues**

---

## 4. Manual NVDA Screen Reader Walkthrough

> **Status:** Pending — requires running the compiled Electron app on a Windows
> machine with NVDA installed. The golden path below describes what to test.

**Golden path:** Launch app → select country → run scenario → view results

### Expected blockers (inferred from static analysis)

| Step | Expected issue |
|------|---------------|
| Launch screen | Dialog announced without name (M-1 above) |
| Language button | Announced as "button" with no label (S-3) |
| Country selection | Country card not reachable by Tab (M-4) |
| Run scenario | Progress not announced; user unaware run started (Mi-2) |
| Results view | Unknown — requires manual test |

### Instructions for manual tester

1. Enable NVDA (`Ctrl+Alt+N`).
2. Launch RISK WISE via `npm run start:electron` or the installed binary.
3. Navigate with `Tab` / `Shift+Tab`; activate with `Enter` / `Space`.
4. At each step, note: (a) what NVDA announces, (b) whether the element is
   reachable, (c) whether focus is visible.
5. Record blockers (completely unreachable) and partial successes separately.
6. Update this section with findings.

---

## 5. Keyboard-only Golden Path

> **Status:** Pending — requires manual test in the running app.

### Elements expected to be unreachable via Tab/Enter/Space

Based on static analysis:

- Country, Hazard, Scenario, TimeHorizon input cards (plain `<div>` with `onClick`)
- Any card in `DataInput`, `MacroEconomicInput`, `AdaptationMeasuresInput` that
  uses the same `Card + onClick` pattern

### Elements expected to be reachable

- All `<Button>` components (MUI renders these as `<button>`)
- All `<Tab>` components in `MainTabs` (MUI uses `role="tab"`)
- Dialog OK/Cancel buttons
- Language selector menu items

### Instructions for manual tester

1. Close NVDA; use keyboard only.
2. Press `Tab` repeatedly from the launch dialog.
3. Mark each interactive element as `✓ reachable` or `✗ unreachable`.
4. Update this section with the full tab-order map.

---

## 6. Arabic RTL Layout Audit

> **Status:** Partially complete — layout assessment from static analysis;
> screenshots pending manual test.

### Root cause

`document.documentElement.dir` is never set (see S-2). Switching to Arabic via
`LanguageButton` translates text strings but leaves the DOM direction as LTR. All
layout artefacts listed below stem from this single missing `dir` update.

### Layout items expected to be broken (LTR → RTL)

| Element | Expected issue |
|---------|---------------|
| AppBar logos | GIZ logo stays on left; should move to right in RTL |
| AppBar button cluster | Minimize/Shutdown stay on right; should flip to left |
| `DataInput` sidebar | Stays on left; RTL convention is right sidebar |
| Progress bar fill | Fills left-to-right; should fill right-to-left |
| Chart (Chart.js) | X-axis ticks remain LTR; Arabic convention is right-to-left |
| Leaflet map | Not inherently affected, but pop-up text alignment stays LTR |
| `MainTabs` indicators | Tab indicator underline stays on left of label |

### Instructions for manual tester

1. Launch the app, switch locale to Arabic.
2. Screenshot each primary screen (launch, parameters, economic, macroeconomic, outputs).
3. For each screenshot, annotate: icons not mirrored, progress bar direction,
   chart axis direction, text alignment.
4. Save screenshots to `docs/screenshots/rtl/` and link from this section.

---

## 7. Phase 3 Scope Implications

This baseline indicates RISK WISE v1 is **not WCAG 2.1 AA conformant**.
The issues with the highest implementation cost for Phase 3 (Area 16) are:

1. **RTL layout** — requires either MUI `<CacheProvider>` with `stylisRTLPlugin`
   (emotion-based RTL) or systematic conversion to CSS logical properties, plus
   a `document.dir` update hook on language change.
2. **Keyboard navigation** — all clickable Card components must be converted to
   `<Button>` or given `role="button" tabIndex={0}` with `onKeyDown` handlers.
3. **Contrast** — requires a design-token layer (see issue #15 MUI v7 ThemeProvider)
   so that colour changes are systematic rather than per-component.
4. **ARIA** — small fixes (aria-label on icon buttons, correct ID references,
   aria-live regions) that can be addressed incrementally.

The three serious violations (S-1, S-2, S-3) are all in `LanguageButton` and
can be fixed in a single small PR.
