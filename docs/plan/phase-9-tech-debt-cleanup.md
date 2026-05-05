# Phase 9 — Technical-Debt Cleanup

> **Weeks**: TBD (post-v2.0; runs after Phase 8 view migrations have merged to avoid touching the same files concurrently).
> **Status**: ⏳ Unstarted.
> **Goal**: Close the four open technical-debt epics — frontend simplification, backend tech-debt, tab-switching consolidation, and the architecture-assessment closure list — without changing user-visible behaviour. The visible outcome is a smaller, more specific surface in `src/store.js`, `backend/base_handler.py`, `MainTabs/MainSubTabs/MainView`, and the CI gate set.
> **Canonical references**: parent epics [#226](https://github.com/CortoMaltese3/riskwise-v2/issues/226) (frontend), [#228](https://github.com/CortoMaltese3/riskwise-v2/issues/228) (backend), [#229](https://github.com/CortoMaltese3/riskwise-v2/issues/229) (tabs), [#233](https://github.com/CortoMaltese3/riskwise-v2/issues/233) (architecture closure). Architecture rules in [`~/.claude/rules/architecture.md`](../../.claude/rules/architecture.md) and [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
> **Hard predecessor**: v2.0 must have shipped (Phase 4 exit met). Phase 8 view migrations (#227, #230, #231, #232) merged so that frontend work in 9.1 / 9.3 doesn't conflict with layout-primitive churn. Phase 8 sub-phases 8.6 / 8.7 may run in parallel with Phase 9.

---

## Why this phase exists

Four open epics document the same kind of debt: things that work today, but where the contract is implicit, the surface is wider than it needs to be, or a defense-in-depth chain has exactly one missing link. Each epic was deliberately written as splittable so child issues can be picked up by `/build` one at a time. Phase 9 is the umbrella that sequences the splits and tracks completion across them.

The four epics break cleanly along ownership lines:

1. **Frontend simplification (#226)** — `src/store.js` god-store, three settings cards reinventing the same list-manager pattern, raw `fetch` calls in three map components, and a deferred decision on cache invalidation strategy.
2. **Backend tech-debt (#228)** — `backend/base_handler.py` god object, two coexisting logging systems, nine `run_*.py` scripts with duplicated boilerplate, ~70 bare `except Exception` clauses, and `print()`-as-IPC.
3. **Tab-switching consolidation (#229)** — magic-number tab indices spread across five files, side effects for one click split between two files, and `<Button>` elements stuffed inside `<Tabs>` with absolute positioning.
4. **Architecture-assessment closures (#233)** — twelve mostly-small items across security, CI gates, observability, supply-chain hygiene, and dead-code cleanup, each with its own acceptance criteria.

None of these change user-visible behaviour. All of them remove footguns, narrow contracts, or activate gates that already-shipped infrastructure was designed for.

---

## Prerequisites

- [ ] v2.0 release tagged (Phase 4 exit criteria met).
- [ ] Phase 6 documentation loop closed ([#205](https://github.com/CortoMaltese3/riskwise-v2/pull/205) merged).
- [ ] Phase 8 view migrations merged: app shell, risk, macro, workspace, home, settings (PRs #227, #230, #231, #232 plus the input-card uniformity work on `refactor/216-input-card-uniformity`).
- [ ] Each parent epic (#226, #228, #229, #233) is split into `/build`-sized child issues before any code lands. Splits use the splitting instructions baked into each parent issue.
- [ ] Open question in #228 resolved: are `run_*.py` scripts spawned as subprocesses by Electron or only called in-process? This determines whether 9.2.1 consolidates them into a shared base class or into a CLI-command framework. Trace `backend/app.py` and the Electron main process before splitting that issue.
- [ ] Open question in #233 work item 4 acknowledged: Playwright E2E unblock is a spike-then-implementation, not a pure implementation issue. The first PR may experiment with `xvfb-run -a`, switch to a Windows runner, or use headless Chromium as an interim measure.

---

## Scope — sub-phases and their cuts

Each sub-phase corresponds to one parent epic. The label convention is `phase-9/<sub-phase-slug>`, mirroring `phase-8/<slug>`. Child issues inherit the sub-phase label plus a per-item slug.

### 9.1 — Frontend simplification (parent #226)

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 9.1.1 — `useListManager` hook | Extract the shared refresh / busy / delete-confirm / error-toast pattern from the three settings cards into `src/hooks/useListManager.ts`. Each card loses ≥60 LOC. | `src/hooks/useListManager.ts`, `src/hooks/useListManager.test.ts`, `src/components/settings/{CREDDataSection,MeasuresSection,CustomDataSection}.jsx` | `phase-9/list-manager` | none |
| 9.1.2 — `RiskWiseClient.fetchGeoJson` | Move the three raw `fetch(fileUrl)` calls in map components behind `RiskWiseClient` per architecture rule #3 (third-party SDKs behind adapters). | `src/lib/RiskWiseClient.ts`, `src/components/map/{RiskMap,HazardMap,ExposureMap}.jsx` | `phase-9/client-geojson` | none |
| 9.1.3 — Store split | Reorganise `src/store.js` (405 LOC, 68 setters) into `useUIStore`, `useWorkspaceStore` (absorb existing `workspaceSlice.js`), `useResultsStore`. Each store < 200 LOC. Cross-store side effects become explicit calls, not implicit setters. | `src/store/{ui,workspace,results}.{ts,js}`, `src/store.js` (delete), ~50 component call sites | `phase-9/store-split` | 9.1.1 (settings cards simpler to update after the hook lands) |
| 9.1.4a — Decompose `CREDDataSection` | Extract `<DataList>`, `<DataUploadForm>`, `<DataDeleteConfirmation>` sub-components. Parent drops to ≤150 LOC. | `src/components/settings/CREDData/*.jsx` | `phase-9/decompose-cred` | 9.1.1 |
| 9.1.4b — Decompose `MeasuresSection` | Same pattern as 9.1.4a applied to measures. | `src/components/settings/Measures/*.jsx` | `phase-9/decompose-measures` | 9.1.1 |
| 9.1.4c — Decompose `CustomDataSection` | Same pattern as 9.1.4a applied to custom data. | `src/components/settings/CustomData/*.jsx` | `phase-9/decompose-custom` | 9.1.1 |
| 9.1.5 — Cache invalidation strategy | Decide between `@tanstack/react-query` and a thin `useMutation(client.method, { invalidates: [queryKey] })` wrapper over `useListManager`. Apply repo-wide. | new wrapper or `react-query` setup; all mutation call sites | `phase-9/cache-invalidation` | 9.1.1, 9.1.3, 9.1.4a–c |

**Housekeeping (fix in passing, no dedicated issue):** `src/riskwise_backend.egg-info/` to `.gitignore`, narrow `any` types in 7 frontend files when touched, opportunistic `useCallback` / `React.memo` in maps and charts.

### 9.2 — Backend tech-debt (parent #228)

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 9.2.1 — Status-code enum + `run_*.py` shared base | `backend/cli/status_codes.py` (`IntEnum`: SUCCESS=2000, VALIDATION=3000, ERROR=4000) and `backend/cli/base.py` (`Command` with try/except + JSON-response shape). Migrate the 9 scripts. | `backend/cli/{status_codes,base}.py`, `backend/run_*.py` (9 files) | `phase-9/cli-base` | subprocess-vs-in-process question resolved |
| 9.2.2 — Narrow exception handling | Define `backend/models/errors.py` taxonomy (`CatalogError`, `DataLoadError`, `ValidationError`, `EngineError`). Replace ~70 `except Exception` clauses with specific catches; let unknown exceptions propagate. Map domain exceptions to HTTP status at the FastAPI boundary. | `backend/models/errors.py`, `backend/**/*.py`, `backend/app.py` | `phase-9/narrow-exceptions` | none (parallel with 9.2.1) |
| 9.2.3 — Replace `print()` for progress | `base_handler.update_progress()` writes to the SSE queue / structured logger instead of `print(json.dumps(...))`. Remove debug prints in `exposure_handler.py`, `hazard_handler.py`, `base_handler.py` (lines ~530, 571, 628, 725). Replace `run_check_data_type.py` / `run_clear_temp_dir.py` stdout prints with proper return values. | `backend/base_handler.py`, `backend/{exposure,hazard}/*_handler.py`, `backend/run_check_data_type.py`, `backend/run_clear_temp_dir.py` | `phase-9/no-print-ipc` | 9.2.1 (so `run_*.py` have proper return paths) |
| 9.2.4 — Logger migration `logger_config` → `logging_config` | Replace every `from backend.logger_config import LoggerConfig` (~27 modules). Update `conftest.py` to call `configure_logging()`. Delete `backend/logger_config.py`. Verify `request_id` propagates through handlers. | `backend/**/*.py`, `backend/conftest.py`, `backend/logger_config.py` (delete), `backend/logging_config.json` (delete if unused) | `phase-9/logger-migration` | 9.2.3 |
| 9.2.5 — Decompose `BaseHandler` | Extract `backend/base_handler.py` (741 LOC) into single-purpose modules: `backend/utils/{country,strings,metadata,data_check,io,fs}.py`. Update all handlers. Delete `BaseHandler`. No new module > 250 LOC. | `backend/utils/*.py` (new), `backend/base_handler.py` (delete), all handlers | `phase-9/decompose-base-handler` | 9.2.1, 9.2.2, 9.2.3, 9.2.4 |

**Out of scope for 9.2 (future epic):** decomposing `hazard_handler.py` (511), `impact_handler.py` (449), `costben_handler.py` (445); splitting `app.py` (944); introducing a real job queue; pluggable file-format loaders.

### 9.3 — Tab-switching consolidation (parent #229)

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 9.3.1 — `TABS` enum + config table | Replace numeric tab indices `0/1/2/3` with named constants in `src/components/main/tabs.js` plus a `TAB_CONFIG` table. `MainTabs`, `MainSubTabs`, `MainView`, `setSelectedTab`, `MainViewTitle` all read from this single source of truth. | `src/components/main/{tabs.js,MainTabs.jsx,MainSubTabs.jsx,MainView.jsx}`, `src/store.js` (or its successor from 9.1.3), `src/components/title/MainViewTitle.jsx` | `phase-9/tabs-enum` | none |
| 9.3.2 — Move on-enter fetches into views | `MainTabs.handleTabChange` no longer fetches. `ReportsView` lazy-fetches reports on activation; macro view lazy-loads CRED data on activation. Idempotent on remount; no duplicate fetches on rapid switching. | `src/components/main/MainTabs.jsx`, `src/components/reports/ReportsView.jsx` (or analogue), macro view entry point | `phase-9/tabs-fetch-effects` | 9.3.1 |
| 9.3.3 — Split `<SubTabs>` from `<SubTabActions>` | Move "Save Scenario" / "Save Map" / "Save Chart" out of `<Tabs>` into a sibling toolbar (flex, right-aligned). Drops `index === 2/3` branching and `right: 100 \| 0 \| 8` absolute-position hack. Buttons announced as buttons (not tabs) to assistive tech; axe-core gate passes. | `src/components/main/MainSubTabs.jsx` (split into two files) | `phase-9/subtabs-actions` | none (independent of 9.3.1, 9.3.2) |

### 9.4 — Architecture-assessment closures (parent #233)

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 9.4.1 — Verify engine ZIP SHA-256 on first-launch download | Compute `sha256File(archivePath)` and compare against `manifest.sha256` between size check and `tar -xf` in `public/electron.js:222–349`. Mirror the pattern at lines 1919–1940. | `public/electron.js` | `phase-9/engine-sha-firstlaunch` | none |
| 9.4.2 — Enforce 50 MB upload size limits | Reject uploads > 50 MB at the FastAPI / Pydantic boundary on custom-data, CRED dataset, and measures-set upload routes. Integration tests post 51 MB and 49 MB streams. | `backend/app.py`, `backend/models/`, `backend/{custom_data,macroeconomic,measures}/*` | `phase-9/upload-size-limit` | none |
| 9.4.3 — Gate `release.yml` on `tests.yml` | Either add `needs:` from release jobs to a successful `tests.yml` run on the same SHA, or add a branch protection rule. Document the choice in `CONTRIBUTING.md`. | `.github/workflows/release.yml`, `CONTRIBUTING.md` | `phase-9/release-gate` | none |
| 9.4.4 — Unblock Playwright E2E in CI | Replace `if: false` guard at `.github/workflows/tests.yml:158` with a working Playwright job. Spike component expected first (xvfb-run vs Windows runner vs headless Chromium subset). 3 consecutive `main` runs pass clean. | `.github/workflows/tests.yml`, possibly `playwright.config.ts`, possibly new tests | `phase-9/e2e-unblock` | none; treat as spike → decision → implementation |
| 9.4.5 — Activate four CI gates in one PR | Coverage threshold (`--coverage.statements=70`), axe-core gate, TypeScript ESLint for `src/lib/*.ts`, commitlint via Husky `commit-msg`. If any one is non-trivial, split it out. | `.github/workflows/tests.yml`, `package.json`, `eslint.config.mjs`, `.husky/commit-msg` (new), `commitlint.config.js` (new) | `phase-9/ci-gates-bundle` | none |
| 9.4.6 — Auto-inject `X-Request-ID` in `RiskWiseClient` | Mint a UUID per call inside `RiskWiseClient`, pulling from `src/lib/logger.ts`. Same ID appears in frontend log, Electron main, FastAPI structlog. | `src/lib/{RiskWiseClient,logger}.ts` | `phase-9/request-id-auto` | none |
| 9.4.7 — Wire "Export Diagnostics" Settings button | `buildDiagnosticsZip` already exists in Electron main. Add Settings UI entry, IPC channel in `public/preload.js`, save-dialog flow, document zip contents in `docs/privacy.md`. | `src/components/settings/DiagnosticsSection.jsx`, `public/{preload,electron}.js`, `docs/privacy.md` | `phase-9/diagnostics-export` | none |
| 9.4.8 — BiDi isolation in Chart.js labels | Apply U+2066/U+2069 wrapper (already used in `src/i18nConfig.js:41–57`) to dataset labels and tick formatters in `WaterfallChart`, `CostBenefitChart`, `MacroEconomicChart`. Extract to `src/lib/bidi.ts`. | `src/lib/bidi.ts` (new or extracted), the three chart components | `phase-9/bidi-charts` | none |
| 9.4.9 — Wire `scripts/generate_manifest.py` into release | Regenerate `data/manifest.json` at release time. Remove `RISKWISE_SKIP_MANIFEST_VERIFY=1` override at `tests.yml:111`. | `.github/workflows/{release,tests}.yml`, `scripts/generate_manifest.py` | `phase-9/manifest-release` | none |
| 9.4.10 — Monthly SBOM regeneration | Cron workflow: 1st of the month, regenerate `sbom.json` and `NOTICES.txt`, open a PR with the diff (or no-op). | `.github/workflows/sbom-refresh.yml` (new) | `phase-9/sbom-monthly` | none |
| 9.4.11 — Documentation gap closures | One docs PR: `docs/errors.md` cataloguing the 1000–6999 error-code taxonomy, `SECURITY.md` "Known accepted risks" subsection covering `style-src 'unsafe-inline'`, `// TODO(D24)` comments at offline-mode enforcement points (`public/electron.js:456`, `:572–574`). | `docs/errors.md` (new), `SECURITY.md`, `public/electron.js` | `phase-9/docs-gaps` | none |
| 9.4.12 — Repository cleanup | One cleanup PR: orphan deps in `requirements/requirements.txt` (docx2pdf, docxtpl, python-docx), delete `scripts/build_engine_pyinstaller.ps1`, delete `src/components/nav/Header.module.css` and migrate styling, delete `src/App.css`. | as listed | `phase-9/repo-cleanup` | none (Header.module.css overlaps with phase-8/cleanup; coordinate with whichever lands first) |

---

## Issue template for sub-phase issues

All Phase 9 issues use the body shape below. The parent-epic link is mandatory — every sub-phase implements an item from one of the four umbrella issues, and the link gives `/build` the exact rule to apply.

```markdown
## Goal
One sentence. What changes and why.

## Parent epic
Closes part of #<226|228|229|233> — <one-line summary of the work item this issue covers>.

## Files in scope
Explicit list. Anything outside this list is out of scope for this issue.

## Acceptance criteria
- [ ] Observable check 1
- [ ] Observable check 2
- [ ] No new ESLint warnings; existing tests pass

## Verification commands
    npm run lint
    npm test
    npm run start:electron        # frontend issues
    pytest                        # backend issues
    pytest backend/test_app.py    # backend issues touching API surface

Plus any manual checks (smoke test of the changed flow, RTL spot-check for i18n-touching changes).

## Depends on
#NN (must be merged first), or "none".
```

---

## Exit criteria

Frontend (parent #226):

- [ ] `src/hooks/useListManager.ts` exists; the three settings cards each lose ≥60 LOC.
- [ ] Zero `fetch(` calls in `src/components/map/`; `RiskWiseClient.fetchGeoJson` in use.
- [ ] `src/store.js` deleted; three focused stores under `src/store/` each < 200 LOC.
- [ ] `CREDDataSection`, `MeasuresSection`, `CustomDataSection` parents each ≤ 150 LOC; sub-components have render tests.
- [ ] Cache-invalidation pattern (React Query or `useMutation` wrapper) chosen, documented, applied repo-wide; no manual `refresh()` calls remain after mutations.

Backend (parent #228):

- [ ] No hardcoded `2000`/`3000`/`4000` literals in `backend/run_*.py`; each `run_*.py` < 80 lines.
- [ ] `grep -rn "except Exception" backend/` ≤ 5 occurrences (only at outermost boundaries with justification comments).
- [ ] `grep -rn "^\s*print(" backend/ --include="*.py"` returns 0 outside `__main__` blocks.
- [ ] `backend/logger_config.py` deleted; `grep -rn "LoggerConfig" backend/` returns 0.
- [ ] `backend/base_handler.py` deleted; no new utility module > 250 LOC; full test suite green; manual scenario run identical to pre-refactor.

Tabs (parent #229):

- [ ] No `selectedTab === <number>` comparisons in `src/components/main/**` or any store.
- [ ] No `main_view_tab_<number>_title` i18n keys remain (or they alias to a stable name-keyed lookup).
- [ ] `MainTabs.handleTabChange` does no data fetching.
- [ ] `<Tabs>` in the subtab area contains only `<Tab>` children; toolbar buttons live in a sibling flex toolbar; axe-core gate passes.

Architecture closures (parent #233):

- [ ] First-launch engine download verifies SHA-256 against the signed manifest before extracting.
- [ ] All upload endpoints reject files > 50 MB with a structured error in the 2000–2999 range; integration tests cover 51 MB rejection and 49 MB success.
- [ ] `release.yml` is gated on `tests.yml` (workflow `needs:` or branch protection); choice documented in `CONTRIBUTING.md`.
- [ ] Playwright job runs on every PR; 3 consecutive `main` runs pass clean.
- [ ] Coverage / axe-core / TS-ESLint / commitlint gates active and fail when violated.
- [ ] Every `RiskWiseClient` call carries `X-Request-ID`; same ID visible end-to-end in frontend log, electron-log, and FastAPI structlog.
- [ ] Settings has an "Export diagnostics" button producing a `.zip` with logs, system info, versions, scenario state; contents documented in `docs/privacy.md`.
- [ ] Arabic locale renders charts without mixed-direction artifacts; snapshot baseline in place.
- [ ] Release pipeline regenerates `data/manifest.json`; `RISKWISE_SKIP_MANIFEST_VERIFY` removed from `tests.yml`.
- [ ] Monthly SBOM-refresh workflow exists and has produced at least one no-op or PR run.
- [ ] `docs/errors.md` exists with the 1000–6999 taxonomy; `SECURITY.md` covers the `style-src 'unsafe-inline'` trade-off; `// TODO(D24)` comments in place.
- [ ] Repo cleanup landed: orphan Python deps removed, `scripts/build_engine_pyinstaller.ps1` deleted, `Header.module.css` and `App.css` removed.

---

## Sequencing

```
9.1.1 ──┬──> 9.1.3 ──> 9.1.5
        ├──> 9.1.4a ──┘
        ├──> 9.1.4b ──┘
        └──> 9.1.4c ──┘
9.1.2 (independent of all)

9.2.1 ──┐
        ├──> 9.2.3 ──> 9.2.4 ──> 9.2.5
9.2.2 ──┘

9.3.1 ──> 9.3.2
9.3.3 (independent)

9.4.* — all independent of each other and of 9.1/9.2/9.3, except 9.4.12 vs phase-8/cleanup (coordinate Header.module.css ownership).
```

Recommended order:

1. **Quick wins first** — 9.1.1 (`useListManager`, ~1 day), 9.1.2 (`fetchGeoJson`, ~4 hours), 9.4.1 (engine SHA), 9.4.6 (auto request-ID), 9.3.1 (TABS enum). All small, all unblock follow-on work.
2. **Backend rot, in dependency order** — 9.2.1 / 9.2.2 in parallel, then 9.2.3, 9.2.4, 9.2.5.
3. **Frontend decomposition** — 9.1.3 (store split), 9.1.4a/b/c in parallel, then 9.1.5 (cache invalidation, last so it's not refactored twice).
4. **Tabs cleanup** — 9.3.2 after 9.3.1; 9.3.3 any time.
5. **Architecture closures** — bundle 9.4.* into ~3 themed PRs to amortise review overhead. P0: 9.4.1, 9.4.2. P1: 9.4.3, 9.4.4 (spike), 9.4.5. P2: 9.4.7–9.4.12.

---

## Where to start from cold

1. Confirm prerequisites above; in particular, verify that Phase 8 view migrations have merged so 9.1 / 9.3 won't conflict with layout-primitive churn.
2. Read each parent epic end to end before splitting: [#226](https://github.com/CortoMaltese3/riskwise-v2/issues/226), [#228](https://github.com/CortoMaltese3/riskwise-v2/issues/228), [#229](https://github.com/CortoMaltese3/riskwise-v2/issues/229), [#233](https://github.com/CortoMaltese3/riskwise-v2/issues/233). Each carries its own splitting instructions for Claude — follow them.
3. Resolve the open question in #228 (subprocess vs in-process for `run_*.py`) before splitting 9.2.1.
4. Open child issues with labels `phase-9` plus the per-item slug from the scope tables. Do not start with 9.1.5 / 9.2.5 — both are deliberately last.
5. Pick a quick-win first (9.1.1 or 9.1.2 or 9.4.1) to validate the `/build` flow on this phase before committing to the larger refactors.
6. As children merge, tick the matching exit-criteria checkbox in this file and update the status column in [`README.md`](README.md).
