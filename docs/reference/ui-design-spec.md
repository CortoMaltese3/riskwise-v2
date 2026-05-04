# UI Design Spec — RISK WISE

**Status**: Frozen for Phase 8 (UI Layout Architecture Refinement).
**Last reviewed**: 2026-05-04.
**Scope**: Layout, density, motion, focus, and state conventions for the desktop Electron app. Visual identity (palette, typography, iconography) is set in [`src/theme/theme.ts`](../../src/theme/theme.ts) and the Phase 3 work — this spec only covers the layout-architecture layer that Phase 8 enforces.

This spec is the input to [Phase 8](../plan/phase-8-ui-layout.md). Every Phase 8 issue references one or more sections below; deviation requires either a spec amendment or an explicit override recorded in [DECISIONS.md](../DECISIONS.md).

## Target form factor

RISK WISE is a Windows desktop Electron app. **Mobile and touch are out of scope.** macOS and Linux are deferred (see [Phase 7](../plan/phase-7-optional.md)). The spec assumes:

- Pointer + keyboard input.
- Display via the user's primary monitor; common laptop and external sizes.
- Locale set at launch (not responsive to mid-session changes other than via the language menu).

## Viewport floor and supported sizes

| Tier | Resolution | Treatment |
|---|---|---|
| Floor | **1280 × 720** | Must fit single-view, no page scrollbar, no clipping of primary controls. |
| Typical laptop | 1366 × 768 | Same as floor. The most common GIZ-staff laptop class — every view must verify at this size. |
| Desktop | 1920 × 1080 | Same constraints; spacing scales naturally. |
| Large / 4K | up to 3840 × 2160 | No upper bound. Wide sections cap at a reasonable max-width and centre rather than stretching unbounded. |

Below the floor (1280 × 720), behaviour is undefined; the app is not expected to run gracefully and may show clipped chrome. We do not optimise for it.

## Single-view rule

The browser / Electron window must never show a **page-level** scrollbar.

- The outermost shell is `100vh`, `overflow: hidden`.
- Internal scrolling is confined to specific regions (the `ScrollableRegion` primitive added in Phase 8 sub-phase 8.3).
- A region that exceeds its budget shows its own scrollbar, never the page's.
- [`ScenarioPrintView`](../../src/components/workspace/ScenarioPrintView.tsx) is the explicit exception — it intentionally escapes the viewport-locking shell so print output can extend across pages.

## Density

**Compact density throughout.** Default MUI spacing is too roomy for an information-dense desktop tool.

- All spacing comes from `theme.spacing(n)` (the MUI 8 px scale). No raw pixel values in component code.
- Exceptions, codified as named constants:
  - `TOP_BAR_HEIGHT = 80` (driven by the GIZ logo at 64 px + 8 px top/bottom margin).
  - `SIDEBAR_WIDTH = 220` / `SIDEBAR_COLLAPSED_WIDTH = 60`.
  - `INPUT_CARD_HEIGHT = 110`.
- A single MUI `Typography` scale governs all text. No bespoke font sizes.
- The `eslint.config.mjs` raw-hex ban (Phase 3) extends to raw spacing values outside fixed chrome: `px` / `em` literals are not allowed in component code.

## Theme

- Light theme only for v1. Dark mode is a [Phase 7](../plan/phase-7-optional.md) candidate; Phase 8 must leave the foundation clean for it — no light-mode-specific colour assumptions outside theme tokens.
- All palette access goes through `theme.palette.*` or `var(--mui-palette-*)`. The MUI v9 `cssVariables: true` flag is already enabled in [`src/theme/theme.ts`](../../src/theme/theme.ts); every palette token is exposed as a CSS custom property. Repeated layout patterns may be promoted to plain CSS classes (or `styled()` blocks) consuming those variables rather than `sx` blocks. See [D27](../DECISIONS.md#d27--mui--emotion--css-variables-stay-no-tailwind).
- RTL layout (`ar` locale) must mirror correctly. The Phase 3 work covers icons, progress bars, and chart axes; Phase 8's primitives must not regress that.

## Motion

- One canonical duration: **150 ms**.
- One canonical easing: `easeOut`.
- Applied to: sidebar collapse / expand, card hover, drawer open / close, panel resize.
- **Not** applied to: chart animations (Chart.js owns those), map transitions (Leaflet owns those), skeleton shimmers (MUI default is fine).
- Ad-hoc transition strings (e.g. `transition: "background-color 0.3s, transform 0.1s"`) are banned — Phase 8 sub-phase 8.6 removes the existing offenders.
- `prefers-reduced-motion` is respected (MUI v9 default behaviour).

## Focus and keyboard

- Every interactive element is reachable via Tab, in DOM order, with a visible focus ring.
- The focus ring is owned by `MuiButtonBase.styleOverrides.root['&:focus-visible']` in [`src/theme/theme.ts`](../../src/theme/theme.ts). No component overrides this without a code-comment justification.
- `Dialog` and `Drawer` instances trap focus and return it to the trigger on close (MUI default; verified by `tests/e2e/a11y.spec.ts`).
- Global shortcuts: `F1` toggles the help menu, `Shift + ?` opens it. Bound in [`src/App.jsx`](../../src/App.jsx).
- The full keyboard golden path is documented in [`docs/reference/accessibility.md`](accessibility.md) § "Keyboard walkthrough" — primitives must not regress it.

## State coverage

Every data-bearing region must explicitly handle three states:

1. **Loading** — `LoadingSkeleton` or `ProgressOverlay` while a fetch / scenario run is in flight. `aria-live="polite"` for status updates that should not interrupt; `aria-live="assertive"` for errors.
2. **Empty** — explanatory copy plus a primary call-to-action (existing pattern: `MacroEmptyState` in [`AppShell.jsx`](../../src/components/layout/AppShell.jsx)). No blank panels.
3. **Error** — caught at the boundary by `ErrorBoundary` (component crash) or surfaced as a toast via `ErrorToast` (network / engine failure). No raw stack traces.

Phase 8 does not introduce new states; it asserts that every region migrated to primitives demonstrably has all three.

## Internationalisation width

- Supported locales: `en` (default), `ar` (RTL test target), `th` (Phase 3 — also serves as the longest-rendered-string benchmark in the absence of a German locale).
- Sidebar labels and primary buttons must not truncate in any supported locale at the viewport floor. A label that cannot fit is a content / design issue surfaced as a sub-phase 8.7 verification finding, not silently truncated.

## Print

- `ScenarioPrintView` is the only screen that escapes the single-view rule. It uses an unboxed root (no `100vh` / `overflow: hidden`).
- Phase 8 primitives must accept a `print` mode (or a sibling primitive set) that opts out of viewport locking. The exact API is decided in sub-phase 8.3.

## Verification commands

A view is spec-compliant when all of the following pass for that view:

```
npm run lint
npm test
npm run lint:contrast
npm run test:e2e          # includes a11y.spec.ts and rtl.spec.ts
npm run start:electron    # full rebuild — do not use quickstart for spec verification
```

Plus, manual at 1280 × 720 / 1366 × 768 / 1920 × 1080 in `en` / `ar` / `th`:

- No page-level scrollbar.
- No clipped controls.
- Sidebar labels fit at expanded width without truncation.
- Tab traversal reaches every interactive element with a visible focus ring.
