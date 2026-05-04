# Phase 8 — UI Layout Architecture Refinement

> **Weeks**: TBD (post-v2.0; sequenced after Phase 6 documentation closure, independent of Phase 7).
> **Status**: ⏳ Unstarted.
> **Goal**: Replace the ad-hoc CRA-era CSS layer and per-view layout reinvention with a frozen design spec, a small set of layout primitives, and uniform input cards. The visible outcome is a desktop UI that fits a single view at every supported viewport with no page-level scrollbars.
> **Canonical references**: [DECISIONS.md D27](../DECISIONS.md#d27--mui--emotion--css-variables-stay-no-tailwind), [`docs/reference/ui-design-spec.md`](../reference/ui-design-spec.md).
> **Hard predecessor**: v2.0 must have shipped (Phase 4 exit met). Phase 6 (engine migration) is independent — Phase 8 is not gated on it.

---

## Why this phase exists

Phase 3 shipped the visual transformation on MUI v7 with theme tokens — that work stands and is closed. What surfaced after Phase 3 (and re-surfaced under Phase 6 layout regressions) is a different problem: the **layout layer** has no shared primitives. Every screen rebuilds the `100vh` / `overflow: hidden` / `flex` / `minHeight: 0` / AppBar-padding tree by hand, a CRA-era `App.css` still leaks global `.MuiGrid-container { flex-grow: 1 }` rules, and the seven scenario-input cards have inconsistent DOM that breaks pixel-uniformity regardless of `minHeight` settings.

The result is a UI that fits 1920 × 1080 if you squint, fights you on 1366 × 768, and shows page-level scrollbars where it should not. Phase 8 closes this loop by:

1. Freezing a UI design spec (viewport floor, density, motion, focus, states) so future work has something to verify against.
2. Deleting the legacy CRA CSS layer.
3. Introducing a small set of layout primitives that own the viewport math.
4. Migrating each top-level view to those primitives.
5. Normalising the input-card DOM and switching from `minHeight` to `height` so all seven cards report identical computed dimensions.
6. Polishing density / motion / focus tokens through the existing MUI theme.

This is **not** a component-library swap. The decision to stay on MUI + emotion and reach for `var(--mui-palette-*)` utility classes when `sx` volume becomes a problem is recorded in [D27](../DECISIONS.md#d27--mui--emotion--css-variables-stay-no-tailwind). Dark mode remains a Phase 7 candidate; Phase 8 does not ship it but should leave the foundation clean for it.

---

## Prerequisites

- [ ] v2.0 release tagged (Phase 4 exit criteria met).
- [ ] Phase 6 documentation loop closed ([#205](https://github.com/CortoMaltese3/riskwise-v2/pull/205) merged).
- [ ] [`docs/reference/ui-design-spec.md`](../reference/ui-design-spec.md) merged and frozen — the spec is the input, not an output, of Phase 8.
- [ ] Baseline screenshots captured at 1280 × 720 / 1366 × 768 / 1920 × 1080 / 4K and stored in `docs/audits/ui-baseline-v1/` (sub-phase 8.1 deliverable).

---

## Scope — sub-phases and their cuts

Each row maps to one or more GitHub issues. The label convention is `phase-8/<sub-phase-slug>`, mirroring `phase-7/dark-mode` from Phase 7.

| Sub-phase | Goal | Files in scope | Issue label |
|---|---|---|---|
| **8.1 — Spec & baseline** | Land [`docs/reference/ui-design-spec.md`](../reference/ui-design-spec.md). Capture before-screenshots at the target viewport set in `en` / `de` / `ar`. | `docs/reference/ui-design-spec.md`, `docs/audits/ui-baseline-v1/` | `phase-8/spec` |
| **8.2 — Cleanup** | Delete `src/App.css` and remove its import from `src/App.jsx`. Retire `src/components/nav/Header.module.css` — fold the GIZ-logo sizing into `TopBar`'s `sx` or the theme. After this lands, no CSS file under `src/` ships CRA-template rules. | `src/App.css`, `src/App.jsx`, `src/components/nav/Header.module.css`, `src/components/nav/Header.jsx`, `src/components/layout/TopBar.jsx` | `phase-8/cleanup` |
| **8.3 — Layout primitives** | Add `src/components/layout/primitives/`: `AppViewport` (top-level shell, `100vh`, `overflow: hidden`, AppBar top-padding), `HorizontalSplit` (flex row with `minHeight: 0`), `ScrollableRegion` (internal-scroll content area), `FixedColumn` (non-scrolling sidebar / panel column). Each primitive is one component with a typed prop surface; the viewport math lives in the primitive, not at call sites. Each primitive carries its own unit test. The set must support a `print` mode (sub-phase 8.7 verifies). | `src/components/layout/primitives/*.{jsx,test.jsx}` | `phase-8/primitives` |
| **8.4 — View migrations** | Migrate each top-level view to the primitives. One issue per view: `phase-8/view-app-shell`, `phase-8/view-risk`, `phase-8/view-macro`, `phase-8/view-workspace`, `phase-8/view-home`, `phase-8/view-settings`. Each issue replaces ad-hoc Box trees with primitives, preserves existing behaviour, and verifies the target viewport set. Migrations land independently — primitives must merge first. | `src/components/layout/AppShell.jsx`, `src/components/main/MainView.jsx`, `src/components/inputMacro/MacroEconomicInput.jsx`, `src/components/workspace/WorkspaceView.jsx`, `src/components/layout/views/HomeView.jsx`, `src/components/settings/SettingsView.jsx`, plus their immediate children | `phase-8/views` |
| **8.5 — Input card uniformity** | Switch [`getInputCardSx`](../../src/components/input/inputCardStyles.js) from `minHeight: INPUT_CARD_MIN_HEIGHT` to `height: INPUT_CARD_HEIGHT`. Normalise the DOM of `Country.jsx`, `Hazard.jsx`, `Scenario.jsx`, `TimeHorizon.jsx`, `ExposureEconomic.jsx`, `ExposureNonEconomic.jsx`, `AnnualGrowth.jsx` so each renders the same shape (label + read-only `TextField` with placeholder when nothing is selected). Every card reports identical computed height across selection states. | `src/components/input/inputCardStyles.js`, `src/components/input/{Country,Hazard,Scenario,TimeHorizon,ExposureEconomic,ExposureNonEconomic,AnnualGrowth}.jsx` | `phase-8/cards` |
| **8.6 — Theme polish** | Add density / motion / focus tokens to the MUI theme. Density: 8 px scale enforced; raw px banned outside fixed chrome (`TOP_BAR_HEIGHT`, `SIDEBAR_WIDTH`, `SIDEBAR_COLLAPSED_WIDTH`, `INPUT_CARD_HEIGHT`). Motion: one duration (150 ms) and one easing applied to all layout transitions; ad-hoc `transition: ...` strings removed. Focus: visible focus ring on every interactive element, verified at `:focus-visible`. | `src/theme/theme.ts`, residual `transition: ...` strings in `inputCardStyles.js` and elsewhere | `phase-8/polish` |
| **8.7 — Visual regression + QA** | Add Playwright visual-regression tests (one per primary view) at the target viewport set in `en` / `de` / `ar`. Run NVDA smoke against the new layout per [`docs/reference/accessibility.md`](../reference/accessibility.md). Confirm `ScenarioPrintView` still renders correctly (primitives must not break print). Update `docs/audits/ui-baseline-v1/` with after-screenshots alongside the 8.1 baselines. | `tests/e2e/visual.spec.ts`, `docs/audits/ui-baseline-v1/` | `phase-8/qa` |

---

## Issue template for sub-phase issues

All Phase 8 issues use the body shape below. The spec link is mandatory — every sub-phase enforces some clause of it, and the link gives `/build` the exact rule it must apply without re-reading prior conversations.

```markdown
## Goal
One sentence. What changes and why.

## Spec reference
Per `docs/reference/ui-design-spec.md` § <Section> — <one-line summary of the rule this issue enforces>.

## Files in scope
Explicit list. Anything outside this list is out of scope for this issue.

## Acceptance criteria
- [ ] Observable check 1
- [ ] Observable check 2
- [ ] No new ESLint warnings; existing tests pass

## Verification commands
    npm run lint
    npm test
    npm run start:electron

Plus any manual checks (Playwright at the target viewports, NVDA spot-check, RTL spot-check).

## Depends on
#NN (must be merged first), or "none".
```

---

## Exit criteria

- [ ] `src/App.css` and `src/components/nav/Header.module.css` removed; no CRA-template rules in any CSS file under `src/`.
- [ ] All five top-level views render through the new primitives; no ad-hoc `100vh` / `overflow: hidden` / `flex` / `minHeight: 0` trees remain in view code.
- [ ] At 1280 × 720 / 1366 × 768 / 1920 × 1080 in `en` / `de` / `ar`, every primary view fits without a page-level scrollbar (verified by Playwright visual specs).
- [ ] All seven scenario-input cards report identical computed height in every selection state.
- [ ] Theme exposes one motion duration plus one easing; layout transitions use them, no ad-hoc `transition: ...` strings remain.
- [ ] WCAG 2.1 AA gate (`npm test`, `npm run lint:contrast`, `npm run test:e2e`) still passes.
- [ ] `ScenarioPrintView` still renders end-to-end (primitives respect print mode).
- [ ] Baseline (8.1) and post-migration screenshots committed to `docs/audits/ui-baseline-v1/`; visible improvement documented per view.

---

## Where to start from cold

1. Confirm prerequisites above; in particular, read [`docs/reference/ui-design-spec.md`](../reference/ui-design-spec.md) end to end before opening issues.
2. Open sub-phase 8.1 first (spec finalisation + baseline screenshots). Land it before any code change.
3. Open 8.2 (cleanup) immediately after — legacy globals block clean refactors.
4. Open 8.3 (primitives) once 8.2 has merged; 8.4 view-migration issues stay closed until 8.3 has merged.
5. 8.4 issues may be worked in parallel after 8.3 lands. 8.5 may run in parallel with 8.4 (different files).
6. 8.6 and 8.7 close the phase; do not land them until 8.4 + 8.5 are complete.
7. Phase 8 issues are not yet created as of 2026-05-04. Create them at phase start with labels `phase-8` plus the sub-phase slug from the scope table.
