# MUI v5 → v7+ Upgrade Spike Notes (Phase 0, Issue #6)

**Date:** 2026-04-18
**Branch:** `chore/6-mui-v7-theme-spike`
**Scope:** Theme skeleton, `ThemeProvider`, one-screen migration to zero hex literals, Leaflet / i18n regression audit. Phase 1 (Area 12.1) implements the full design-token rollout.

---

## 1. Actual starting point

The issue was scoped against v1's `@mui/material@5.15`, but Dependabot's
"everything group" PR (#2, `cfadd22`) had already bumped the MUI core packages
to **`@mui/material@9.0.0`** and **`@mui/icons-material@9.0.0`** before this
spike started.

Consequence:

- The "upgrade v5 → v7" acceptance criterion is satisfied automatically (we
  are past v7). The remaining spike work — `ThemeProvider`, CSS variables,
  one-screen migration — is the valuable part.
- `@mui/lab` is **still pinned at `5.0.0-alpha.177`**, which no longer matches
  the v9 core API for shared internals. Only `LoadingButton` is imported from
  it ([RunScenarioButton.jsx:5](../src/components/nav/RunScenarioButton.jsx#L5)).
  `LoadingButton` was promoted to `@mui/material` around v6.4 as `Button`'s
  `loading` prop; Phase 1 should drop `@mui/lab` and switch to
  `<Button loading loadingPosition="end">…</Button>`. Not done in this spike
  to keep the scope strictly to theming.
- React is on 19.2; `@emotion/react@11.14` and `@emotion/styled@11.14` are
  compatible with MUI 9.

## 2. What the spike shipped

| File | Change |
|---|---|
| [src/theme/theme.ts](../src/theme/theme.ts) | New. `createTheme` with `cssVariables: true`, Inter font stack, primary palette (teal `#45ABB9`), `shape.borderRadius: 12`, and a custom `palette.inputCard` namespace carrying the legacy card-state colours. Includes a TypeScript module-augmentation block for the custom palette key; until a `tsconfig.json` lands it is stripped at build time but documents the intended shape for Phase 1. |
| [src/App.jsx](../src/App.jsx) | Wraps the tree in `<ThemeProvider theme={theme}>` + `<CssBaseline />`. |
| [src/components/input/inputCardStyles.js](../src/components/input/inputCardStyles.js) | New. `getInputCardSx(state, { clicked })` and `disabledFieldSx` resolve colours via `theme.palette.inputCard.*` callbacks; removes duplication across the seven card components. |
| `src/components/input/DataInput.jsx`, `Country.jsx`, `Hazard.jsx`, `Scenario.jsx`, `TimeHorizon.jsx`, `ExposureEconomic.jsx`, `ExposureNonEconomic.jsx`, `AnnualGrowth.jsx`, `AdaptationMeasuresInput.jsx` | Hex literals removed. Local `bgColor` string state replaced with a four-value token state (`"default" | "valid" | "invalid" | "neutral"`) so the concern becomes semantic, not colour-specific. |
| [docs/mui-v7-spike-notes.md](./mui-v7-spike-notes.md) | This document. |

Grep audit confirms the migrated screen is clean:

```
$ grep -rn '#[0-9a-fA-F]\{3,6\}' src/components/input/
(no matches)
```

Other screens (`components/main/`, `components/map/`, `components/nav/`,
`components/results/`, `components/reports/`, `components/title/`,
`components/inputMacro/`, `components/tables/`, etc.) still contain the
~30 hex literals flagged in Area 12. Phase 1 migrates them in batches.

## 3. Breaking changes encountered (and not yet fixed)

These are changes between v5.15 and v9 that affect this codebase. Only the
theming-related ones were addressed in this spike; the rest are left for
Phase 1.

### 3.1 Addressed by this spike

- **CSS variables are opt-in.** v5 emitted static classes only. v7 added
  `cssVariables: true`; v9 keeps the opt-in. Enabled so runtime
  theme-switching (light/dark / contrast) becomes a CSS custom-property swap
  rather than a React re-render cascade. Phase 1 dark-mode and RTL toggles
  depend on this.
- **Custom palette augmentation.** The v5 pattern of typing `theme.palette.foo`
  via module augmentation still works; we include the declaration block in
  `theme.ts` but note it is inert without `tsconfig.json`.

### 3.2 Deferred to Phase 1

- **`Grid` API.** v5 took `<Grid item xs={12} md={2}>`. v7 deprecated that in
  favour of `<Grid size={{ xs: 12, md: 2 }}>` (the old "Grid2" was promoted).
  v9 still accepts the legacy props with a console warning (not an error).
  [App.jsx:47](../src/App.jsx#L47), `DataInput.jsx`, and most layout files use
  the old API. Phase 1 task: migrate all `<Grid item xs/md/...>` to the
  `size={{ … }}` form, then drop the compat shim.
- **`InputProps` → `slotProps.input`.** v7 moved most component overrides to
  the `slots` / `slotProps` pattern. v9 keeps `InputProps` as a deprecated
  alias. All seven card files still use the old form after this spike
  (`<TextField … InputProps={{ readOnly: true }}>`); conversion is a sweep
  Phase 1 does in one pass across every `TextField`.
- **`@mui/lab` mismatch.** As above, `LoadingButton` needs to come from
  `@mui/material` as `<Button loading>`. One import to change
  ([RunScenarioButton.jsx:5](../src/components/nav/RunScenarioButton.jsx#L5)),
  plus removing `@mui/lab` from `package.json`.
- **`makeStyles` / `@mui/styles`.** Removed in v6. Grep confirms this
  codebase never used `@mui/styles`, so there is nothing to migrate — all
  styling is already `sx=` or CSS classes. Recording the check here so Phase 1
  knows it is clean.
- **`theme.palette.mode` vs `theme.palette.type`.** v5 renamed `type` →
  `mode`. Our `theme.ts` is already on `mode: "light"`; no other code reads
  the old `type` field.
- **`Button` `endIcon` / `startIcon` spacing.** Minor visual deltas in v7+.
  Flag for visual-QA during Phase 1 but no code change required here.

## 4. Runtime behaviour audit — Leaflet & i18n

### 4.1 Leaflet

- Map overlays pin `zIndex: 1000`
  ([RiskMap.jsx:181](../src/components/map/RiskMap.jsx#L181),
   [ExposureMap.jsx:84](../src/components/map/ExposureMap.jsx#L84),
   [HazardMap.jsx:169](../src/components/map/HazardMap.jsx#L169),
   [Legend.css:6](../src/components/map/Legend.css#L6)).
- MUI defaults: AppBar 1100, Drawer 1200, Modal 1300, Snackbar 1400,
  Tooltip 1500. Leaflet's 1000 sits beneath all of those, which matches the
  v1 layering — `<CssBaseline />` does not touch map z-indexes.
- `CssBaseline` resets body margin and applies the typography font family
  globally. It does **not** affect Leaflet tile containers, which use
  absolute positioning and inline styles.
- **Verdict:** no regressions expected. Needs one visual smoke check in
  Phase 1 (zoom/pan/tile rendering on the Hazard map) when running against a
  live `npm install`.

### 4.2 i18n

- Initialisation runs at [main.jsx:5](../src/main.jsx#L5) via
  `import "./i18nConfig"` before `<App />` renders, unchanged by this spike.
- Every migrated input component still uses `useTranslation`, so translation
  keys continue to resolve the same way.
- [i18nConfig.js:37–58](../src/i18nConfig.js#L37-L58) installs a BiDi-isolate
  post-processor that wraps LTR runs inside RTL strings with U+2066 /
  U+2069 control characters. The theme does **not** set `direction`, so MUI
  still emits LTR defaults — which mirrors v1 behaviour. Phase 1 must add a
  `createTheme({ direction: 'rtl' })` variant and swap it when `i18n.dir()`
  changes, but that is explicitly out of scope for this spike.
- **Verdict:** no i18n regressions from the theme or `<CssBaseline />`.

## 5. Known gaps

1. **No runtime validation.** `node_modules` is not installed in the spike
   environment, so `npm run build`, `npm test`, and `npm run dev` were not
   exercised against these changes. Review requires a local install + smoke
   check before merge.
2. **`theme.ts` under `.js`-only repo.** Vite/esbuild transpiles `.ts`
   without a `tsconfig.json`, but there is no type-checking. Issue
   text explicitly asked for `.ts`; keeping it for Phase 1 when TypeScript
   config lands in earnest.
3. **Only one screen migrated.** The scenario-configuration panel plus the
   adaptation-measures panel (both in `src/components/input/`) are clean;
   every other folder under `src/components/` still contains hex literals.
   Phase 1 Area 12.1 tracks the full sweep.
4. **Dark-mode / high-contrast tokens not yet defined.** `theme.ts` has only
   `mode: "light"`. Phase 1 adds the dark palette and a user toggle.
5. **Custom `inputCard` palette is repo-specific.** The palette keys
   (`default`, `valid`, `invalid`, `neutral`, `hover`, `panelBg`,
   `sectionBg`, `disabledBg`, `disabledText`) encode the current visual
   language. Phase 1 should reconcile these against the design-system output
   and likely rename under a broader `semantic.*` namespace.

## 6. Follow-ups for Phase 1 (Area 12.1)

- Upgrade `@mui/lab` → drop it; switch `LoadingButton` to `Button loading`.
- Grid `item xs/md` → `size={{ xs, md }}` sweep.
- `InputProps` → `slotProps.input` sweep.
- Add dark and high-contrast palettes; gate via user setting.
- Add RTL theme variant wired to `i18n.dir()`.
- Migrate remaining `src/components/*` folders to `theme.palette.*` tokens.
- Introduce `tsconfig.json` and move `theme.ts` under strict type checking.
