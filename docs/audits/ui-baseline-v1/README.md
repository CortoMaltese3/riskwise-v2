# UI baseline v1

Pre-Phase-8 screenshots of every primary view at the supported viewport set, captured on `main` before any layout-primitive migration begins. Sub-phase 8.7 will produce the matching post-migration set and use these PNGs as the visible "before / after" comparison the spec asks for.

## Where the PNGs live

The 72 PNGs are **not** committed to `main` — they are attached as a zip asset on the [`ui-baseline-v1` release](https://github.com/CortoMaltese3/riskwise-v2/releases/tag/ui-baseline-v1). Download `ui-baseline-v1.zip` and unpack it under `docs/audits/ui-baseline-v1/` to reconstitute the layout described below; the locale subdirectories are gitignored so the unpacked tree will not show up in `git status`.

Rationale: a 13 MB pile of binary artefacts inflates the repo permanently for a one-off reference set. The release asset is the canonical home; this directory hosts the README and (via Phase 8.7) any text-based comparisons.

## What is captured

| Axis | Values |
|---|---|
| Viewports | `1280x720`, `1366x768`, `1920x1080`, `3840x2160` |
| Locales   | `en` (default), `ar` (RTL test target), `th` (long-string benchmark) |
| Views     | `app-shell` (NavigateAlert landing), `home`, `risk`, `macro`, `workspace`, `settings` |

Total artefacts: `4 × 3 × 6 = 72` PNGs, laid out as `<locale>/<viewport>/<view>.png` inside the zip.

## How it was captured

Driven by [tests/e2e/baseline-screenshots.spec.ts](../../../tests/e2e/baseline-screenshots.spec.ts), which launches the production Electron build (`build/electron.js`), sets the renderer viewport via `page.setViewportSize`, switches locale through the in-app language menu, and writes one full-page PNG per `(locale, viewport, view)` cell.

Reproducing the capture:

```
npm run build
npx playwright test tests/e2e/baseline-screenshots.spec.ts
```

The spec writes PNGs into `docs/audits/ui-baseline-v1/<locale>/<viewport>/`. Those subdirectories are gitignored, so a re-run will not dirty the working tree. To refresh the published baseline, re-run the spec, re-zip the locale folders, and replace the asset on the `ui-baseline-v1` release.

`RISKWISE_TEST_MODE=1` is set automatically by the spec so the user-data directory and DuckDB scenario store start clean for every launch.

The 4K-class viewport (`3840x2160`) is set against the Electron renderer; the host OS window may stay smaller than that on screens below 4K, but the renderer still lays out at the requested size and the screenshot reflects 4K regardless of the physical display.

## Known limitations

- **No German locale.** The Phase 8 spec previously listed `de` as the longest-string benchmark, but [src/i18nConfig.js](../../../src/i18nConfig.js) only registers `en` / `ar` / `th`. The spec and Phase 8 plan were amended in issue #207 to align with the shipped resource set; `th` now serves as the long-string baseline. If a `de` resource is added later, this baseline should be re-captured to include it.
- **App-shell view is always English.** The `app-shell` PNG captures the `NavigateAlert` landing dialog, which renders before the `TopBar` (and therefore the language menu) is mounted. The spec accepts this and switches locale only after dismissing the dialog, so the per-locale `app-shell` PNGs will look identical except for OS-level chrome differences. The mirrored-layout / long-string evidence lives in the other five views.
- **Capture is on-demand, not a CI gate.** Re-run the spec by hand when the baseline needs refreshing. Phase 8.7 will introduce a separate visual-regression spec that asserts against these PNGs.
- **First-launch overlays are visible.** `RISKWISE_TEST_MODE=1` wipes user-data on every launch, so the GuidedTour callouts and the Walkthrough welcome modal appear over the first section the spec visits in each run. This is reproducible — Phase 8.7's after-screenshots will show the same overlays at the same positions — but readers should understand they are part of the first-launch state, not part of the section layouts being assessed.
- **`ELECTRON_RUN_AS_NODE=1` in the developer's shell.** If this env var leaks into the launch environment, Electron starts in plain Node mode and rejects Playwright's debug flags ("`Process failed to launch!`"). The spec strips it explicitly from the launch env, so the developer's shell does not need to be cleaned beforehand.
