# Accessibility — RISK WISE

**Standard:** WCAG 2.1 AA
**Last reviewed:** 2026-04-21 (Issue #85)

## Conformance statement

RISK WISE targets **WCAG 2.1 Level AA** conformance. Many government
procurement contexts in the project's deployment regions require this baseline,
so accessibility is a release-blocking concern rather than a polish item.

The baseline audit at [`../audits/accessibility-baseline-v1.md`](../audits/accessibility-baseline-v1.md)
catalogues the v1 violations. This document records the conformance posture
established as part of the Phase 3 UI overhaul (Area 16) and the regression
gate that prevents new violations from merging.

| Criterion family | Status |
|---|---|
| 1.3 Adaptable (landmarks, structure) | ✅ Conformant — `banner`, `navigation`, `main`, `complementary` landmarks in `AppShell` |
| 1.4 Distinguishable (focus, contrast) | ✅ Conformant — visible focus rings via theme; contrast covered by design tokens (#15, #78) |
| 2.1 Keyboard accessible | ✅ Conformant — golden path completable via Tab/Shift+Tab/Enter/Space (see §Keyboard walkthrough) |
| 2.4 Navigable (focus order, page titled) | ✅ Conformant — focus order matches DOM order; modals trap focus |
| 3.1 Readable (lang) | ⚠️ Partial — `lang` attribute updates pending RTL work (#83) |
| 4.1 Compatible (name, role, value) | ✅ Conformant — every `<IconButton>` has `aria-label`; landmarks labelled |
| 4.1.3 Status messages | ✅ Conformant — progress overlay uses `aria-live="polite"`; error toasts use `aria-live="assertive"` |

Items marked **Partial** are tracked in their linked issues. They are out of
scope for the Issue #85 baseline.

## What the gate enforces

- `npm run test` runs `tests/a11y/golden-path.test.jsx`, which renders
  `AppShell`, `RiskAssessmentView`, and `WorkspaceView` (populated and empty)
  and asserts that `axe-core` reports **zero** violations against the
  `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa` rule sets.
- The `color-contrast` rule is disabled in jsdom because the engine cannot
  compute contrast without a real browser. Contrast is verified manually via
  the design-token palette (#78) and tracked for Playwright/Chromium follow-up.
- The eslint config (`eslint.config.mjs`) bans raw hex literals outside
  `src/theme/` so contrast changes are systematic.

A failing axe check fails CI. Suppressing a rule must be done in code with a
comment linking to the tracking issue.

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
| `ProgressOverlay` step label | `polite` | Status updates during scenario run; do not interrupt |
| Error `Snackbar` (severity `error`) | `assertive` | User must be notified immediately of failure |
| Non-error `Snackbar` (info/success/warning) | `polite` | Background acknowledgement |

## Focus management

- Visible focus rings are applied globally via the MUI v7 theme override
  `MuiButtonBase.styleOverrides.root['&:focus-visible']` in
  [`src/theme/theme.ts`](../../src/theme/theme.ts).
- All `<Dialog>` instances rely on MUI's built-in focus trap. None override
  `disableEnforceFocus` (verified via `grep`).

## Keyboard walkthrough — Risk Assessment golden path

The following sequence completes the Risk Assessment golden path with
keyboard only (Tab to advance, Shift+Tab to retreat, Enter/Space to activate).
Run through `npm run dev` after any change that touches input cards or the
sidebar.

1. **Page load** — first Tab moves focus to the sidebar collapse button.
2. **Sidebar** — Tab cycles through Home → Risk Assessment → Macroeconomic →
   Workspace → Settings; Enter selects.
3. **Top bar** — Tab continues through Reload → Language → Minimize → Shutdown.
4. **Country / Hazard / Scenario / TimeHorizon cards** — each card is now a
   `<Button>` (M-4 fix in baseline); Tab reaches every card; Enter/Space
   selects.
5. **Run scenario** — Tab to the run button; Enter starts the run. Focus is
   announced via the `ProgressOverlay` `aria-live="polite"` step label.
6. **Cancel** — within the overlay, Tab reaches the Cancel button.
7. **Results panel** — once the run completes, Tab continues into the
   `complementary` results panel.

If a step is unreachable, file an issue tagged `accessibility` with the step
number and the offending component.

## Out of scope (tracked elsewhere)

- NVDA / JAWS / VoiceOver manual screen-reader walkthroughs — manual step,
  documented in `../audits/accessibility-baseline-v1.md` §4.
- Chart accessibility (alt-text equivalents, data tables) — Issue #84 / #97.
- RTL layout and `lang` attribute updates on locale change — Issue #83.
- Full Chromium-based axe scan with contrast — follow-up Playwright work.
