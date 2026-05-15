# Phase 10 — UI & Logic Enhancements

> **Weeks**: TBD (post-v2.0; runs in parallel with Phase 9 once Phase 8 view migrations have merged).
> **Status**: 🔄 In progress (sub-phase 10.1 actively scoped).
> **Goal**: Raise the analytical credibility and UX coherence of three feature surfaces — Adaptation Measures, Impact Functions, and PDF Reports — plus a slot for smaller cross-cutting UI polish. Each sub-phase fixes a specific gap where the current UI works mechanically but under-delivers value (silent failures, hidden data dependencies, no customization surface, stale outputs).
> **Canonical references**: parent umbrella issues — Adaptation [#443](https://github.com/CortoMaltese3/riskwise-v2/issues/443), Impact Functions [#444](https://github.com/CortoMaltese3/riskwise-v2/issues/444), PDF Reports [#445](https://github.com/CortoMaltese3/riskwise-v2/issues/445). Architecture rules in [`~/.claude/rules/architecture.md`](../../.claude/rules/architecture.md) and [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md). Decision history in [`docs/DECISIONS.md`](../DECISIONS.md).
> **Hard predecessor**: v2.0 must have shipped (Phase 4 exit met). Phase 8 view migrations merged so frontend work in 10.1 / 10.4 does not conflict with layout-primitive churn. Phase 9 sub-phase 9.1 (frontend simplification) may run in parallel; coordinate `useWorkspaceStore` ownership at split time.

---

## Why this phase exists

Three feature surfaces in v2.0 are functionally wired end-to-end but produce analytical output the user cannot fully trust or act on:

1. **Adaptation Measures (10.1)** — The "Adaptation analysis" page renders a catalog of selectable measures from DuckDB, but the cost-benefit chart only plots measures present in the entity XLSX file CLIMADA actually computes against. The two stores are disjoint and the mismatch is never surfaced. Users can confidently check items, click Apply, and see an unchanged chart with no feedback. The page is the most analytically valuable surface in the tool — cost-benefit ratios drive decisions — so the silent under-delivery matters disproportionately.

2. **Impact Functions (10.2)** — Currently a black box. The engine consumes impact functions from XLSX-loaded entities; there is no UI surface to inspect or customize them. For a decision-support tool, this is a credibility gap: stakeholders cannot see *why* a hazard intensity translates into the displayed impact, and analysts cannot adjust function parameters without leaving the app.

3. **PDF Reports (10.3)** — Existing reports omit recently-added analytical surfaces and have known formatting gaps. Several enrichments were captured under tracking issue [#356](https://github.com/CortoMaltese3/riskwise-v2/issues/356).

The fourth slot (**10.4 — General UI enhancements**) is reserved for smaller cross-cutting polish discovered while scoping the three majors. It does not yet have a parent umbrella issue; one will be created if the work coalesces into a coherent set.

None of these change the core compute path. All of them tighten the contract between what the tool computes and what the user sees / can change.

---

## Prerequisites

- [ ] v2.0 release tagged (Phase 4 exit criteria met).
- [ ] Phase 6 documentation loop closed ([#205](https://github.com/CortoMaltese3/riskwise-v2/pull/205) merged).
- [ ] Phase 8 view migrations merged: app shell, risk, macro, workspace, home, settings (PRs #227, #230, #231, #232 plus the input-card uniformity work on `refactor/216-input-card-uniformity`).
- [ ] Each parent umbrella issue is split into `/build`-sized child issues before any code lands. Splits use the per-sub-phase tables below.
- [ ] Open question in 10.1: the duplicate-rows behaviour in the catalog query needs root-cause confirmation (exposure-type splits vs multi-measure-set merge) before the SQL fix in 10.1.1 lands. Resolve as the first acceptance criterion in that issue.

---

## Scope — sub-phases and their cuts

Each sub-phase corresponds to one parent umbrella issue (10.4 deferred until its scope coalesces). Labels follow Phase 9 convention: `phase-10` plus a per-item slug.

### 10.1 — Adaptation Measures (parent [#443](https://github.com/CortoMaltese3/riskwise-v2/issues/443))

The Adaptation page reads a catalog of measures from DuckDB (`adaptation_measures` table joined to `measure_sets`) and the cost-benefit chart plots a separate set of measures loaded from the country/hazard/exposure XLSX entity file. The two stores are disjoint. The page presents the catalog as if every row is selectable; backend filtering by name silently drops catalog selections that have no entity counterpart. The result is a UI that looks more functional than it is.

The six child issues below close that gap incrementally. They are sequenced so each one ships meaningful value on its own; the bigger architectural alignment (10.1.6) is the natural end point, not a prerequisite for the earlier wins.

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 10.1.1 — Dedupe catalog measures at SQL source | Investigate the root cause of duplicate catalog rows (exposure-type splits, multi-measure-set merges, or both) and apply a targeted fix in `costben_handler.get_measures_from_db()`. Catalog responses contain each `(name)` at most once per response, OR carry a discriminator so the UI can render distinct entries. | `backend/costben/costben_handler.py`, `backend/test_costben_handler.py` (or analogue), possibly `backend/db/migrations/000X_*.sql` if schema changes | `phase-10/adaptation-catalog-dedup` | none |
| 10.1.2 — Track UI selection by id; resolve to name at transport boundary | `AdaptationMeasuresInput` checkbox state keyed by `measure.id`, not `measure.name`. The `selectedMeasureIds` store stays name-based at transport (entity matching is name-based per `backend/run_scenario.py:_filter_entity_measures`). Component resolves catalog `id → name` when populating the store. Defense in depth: per-card state remains correct even if 10.1.1 fix degrades. | `src/components/input/AdaptationMeasuresInput.jsx`, `src/store/useWorkspaceStore.js`, `src/components/input/AdaptationMeasuresInput.test.jsx` (or analogue) | `phase-10/adaptation-id-state` | none (parallel with 10.1.1) |
| 10.1.3 — Extend measure-state reset triggers | `setSelectedExposure` (line 264) and any app-option change (era↔custom) reset `selectedMeasureIds`, `appliedMeasureIds`, and `isMeasureSelectionInitialized`, matching the existing behaviour of `setSelectedCountry` / `setSelectedHazard` (lines 257–275). Closes the stale-selection bug when changing exposure type. | `src/store/useWorkspaceStore.js`, `src/store/useWorkspaceStore.test.js` | `phase-10/adaptation-state-reset` | none |
| 10.1.4 — Unify null vs empty-array payload semantics | Pick one wire-format rule: `[]` means "no filter, run all entity measures"; `null` is legacy and removed. `useRunScenario` always sends `selectedMeasureIds: []` (not omitted) for fresh state. Backend treats `[]` the same as omitted in `backend/run_scenario.py`. Eliminates the divergence between Risk-view and Adaptation-view scenario calls. | `src/hooks/useRunScenario.js`, `backend/run_scenario.py`, `backend/models/scenario.py` (or where `ScenarioRunRequest` lives), `backend/test_app.py` | `phase-10/adaptation-payload-semantics` | none |
| 10.1.5 — Surface applicability & skipped-measures feedback | Tag each catalog card with applicability against the current scenario's entity measure list ("✓ in scenario" vs "ⓘ not in this scenario"). Backend returns `skipped_measures` in the scenario response; UI surfaces a toast on Apply when ≥ 1 measure was dropped server-side. Chart title or subtitle reports "Cost-benefit for {n} of {m} selected measures". | `src/components/input/AdaptationMeasuresInput.jsx`, `src/components/charts/CostBenefitChart.jsx` (or analogue), `src/hooks/useRunScenario.js`, `backend/run_scenario.py`, `backend/models/scenario.py`, `src/locales/en.json` (+ other locales) | `phase-10/adaptation-applicability-ui` | 10.1.1 (so the catalog list is itself unambiguous) |
| 10.1.6 — Fold picker into Risk inputs; remove Apply button | Move the measure picker into the Risk Assessment input column as a collapsible panel ("Adaptation measures (N selected)"). Delete the standalone Apply button and the dual-state (`selectedMeasureIds` vs `appliedMeasureIds` vs `isMeasureSelectionInitialized`). The single global Run button drives everything. Adaptation tab becomes a pure results view. | `src/components/input/AdaptationMeasuresInput.jsx` (large refactor or split), `src/components/input/DataInput.jsx`, `src/store/useWorkspaceStore.js`, `src/hooks/useRunScenario.js`, `src/components/nav/RunScenarioButton.jsx`, related tests | `phase-10/adaptation-ux-consolidation` | 10.1.1, 10.1.2, 10.1.3, 10.1.4, 10.1.5 |

**Out of scope for 10.1 (future work):** unifying the catalog (DuckDB) and entity-measure (XLSX) storage models into a single source of truth. Currently the catalog carries cost/benefit metadata richer than the entity XLSX, and CLIMADA's MeasureSet construction expects XLSX-shape inputs. Refactoring the data model is a separate epic and should be opened as its own parent issue when scoped.

### 10.2 — Impact Functions visibility & customization (parent [#444](https://github.com/CortoMaltese3/riskwise-v2/issues/444))

Impact functions translate hazard intensity into expected damage / loss. Today they are a black box: the engine consumes them from XLSX-loaded entities (`backend/engine/loaders/xlsx.py:38` → `entity_present.impfset_specs` → `calculate_impact` at `backend/run_scenario.py`), and there is no UI surface to inspect or customize them. A second source — the per-country JSON registry at `backend/impact/registry.py` — is loaded at startup but **not** consulted at run time; it exists only for the non-run-path `ImpactHandler.get_impact_function_set`. The two can legitimately disagree (the XLSX loader is intentionally permissive per the comment at `backend/engine/loaders/xlsx.py:315`; the registry is stricter).

Phase 10.2 closes this gap in two steps: a read-only viewer that reads from the XLSX (the engine's actual source), then an editor for custom mode that overrides the loaded IF via a scenario-row column without mutating the uploaded XLSX. Architectural decisions are captured in [`docs/DECISIONS.md`](../DECISIONS.md) D28.

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 10.2.1 — Read-only impact-function viewer on Risk inputs | New `ImpactFunctionCard` in the left input column between `ExposureCard` and the Run button; opens a dialog with the `(intensity, mdd, paa)` table and a recharts curve plot. Backed by a new `GET /api/v1/impact-function` endpoint that delegates to the same `load_entity_xlsx` the engine uses — viewer parity with the engine is guaranteed. ERA and custom modes render identically; no write paths. Secondary entry point on `ResultsView` for post-run inspection. | `backend/app.py`, `backend/impact/resolver.py` (new), `backend/models/impact.py`, `backend/test_app.py`, `backend/test_impact_resolver.py` (new), `src/lib/RiskWiseClient.ts`, `src/components/input/ImpactFunctionCard.jsx` (new), `src/components/input/DataInput.jsx`, `src/components/dialogs/ImpactFunctionDialog.jsx` (new), `src/components/results/ResultsView.jsx`, `src/store/useResultsStore.js`, `src/locales/en.json` (+ other locales) | `phase-10/impact-functions-viewer` | none |
| 10.2.2 — Editable impact functions in custom-mode scenarios | Extends 10.2.1 with an Edit mode (custom mode only) on the IF dialog: editable numeric table with live chart preview, server-side validation against registry-strict rules, override persisted as a JSON column on the scenario row. At run time, `entity_present.impfset_specs` is patched with the override before `calculate_impact`; the uploaded XLSX is never modified. Restored scenarios replay the exact override and surface a "Modified" badge on the IF card and `ResultsView` panels. JSON registry repurposed as validator-of-record. ERA stays read-only. Table editing only; graph manipulation deferred. | `backend/db/migrations/000X_scenario_impact_function_override.sql` (new), `backend/models/scenario.py`, `backend/run_scenario.py`, `backend/impact/validator.py` (new), `backend/app.py`, `backend/test_app.py`, `backend/test_run_scenario.py`, `src/lib/RiskWiseClient.ts`, `src/components/dialogs/ImpactFunctionDialog.jsx`, `src/components/input/ImpactFunctionCard.jsx`, `src/components/results/ResultsView.jsx`, `src/store/useWorkspaceStore.js`, `src/hooks/useRunScenario.js`, `src/locales/en.json` (+ other locales) | `phase-10/impact-functions-editor` | 10.2.1 |

**Out of scope for 10.2 (future work):**
- Multi-IF-per-pair scenarios (multi-exposure runs displaying multiple IFs side by side). The registry enforces exactly one IF per `(country, exp_type, haz_type)` today.
- Editing ERA impact functions in-app. ERA is canonical by design; users who want to tamper switch to custom and re-upload.
- Parametric IFs / drag-to-edit-curve UI. Deferred until 10.2.2 ships and real usage shows whether table editing is sufficient.
- Deleting or retiring the JSON registry. Repurposed as validator-of-record in 10.2.2; long-term fate revisited only if editing usage proves the registry obsolete.

### 10.3 — PDF Report enhancements (parent [#445](https://github.com/CortoMaltese3/riskwise-v2/issues/445))

The PDF report v1 landed across PRs #350–#354, #362–#365 and now renders a full per-domain structure with cover page, mini-TOC, executive summary, hazard / exposure / impact / cost-benefit sections, captioned figures and tables, methodology + provenance, and disclaimer. Rendering is entirely client-side via [`ScenarioPrintView.tsx`](../../src/components/workspace/ScenarioPrintView.tsx) in a hidden Electron window; there is no backend report module.

Re-scoping against current code surfaced one umbrella claim that was already stale: "cost-benefit / adaptation results currently omitted" — the cost-benefit chart + measures table (BCR-sorted) has been in Section 8 of the print view since #363. That theme is dropped from 10.3. Tracking issue [#356](https://github.com/CortoMaltese3/riskwise-v2/issues/356) remains the parking lot for deferred v2 ideas (executive notes, editable cover fields, per-export locale override, partner logos, persistence, TOC anchors, snapshot tags/annotations, removing disabled camera buttons) — none of those are promoted into 10.3.

The two child issues below close the remaining real gaps. Both are small; both are independent.

| Child | Goal | Files in scope | Issue label | Depends on |
|---|---|---|---|---|
| 10.3.1 — Scenario ID on cover page | The cover currently shows title, scenario name, country, hazard, time horizon, and two logos but not the scenario identifier. Add a `meta.id` row (full UUID, monospaced, small caption styling) under the existing horizon line so the printed report carries its identifier at-a-glance without flipping to Section 3. Hidden when `meta.id` is absent (defensive only). | `src/components/workspace/ScenarioPrintView.tsx`, `src/components/workspace/ScenarioPrintView.test.tsx`, `src/locales/{en,th,ar}.json` (one new key, e.g. `print_cover_run_code`) | `phase-10/pdf-cover-run-code` | none |
| 10.3.2 — RTL locale parity audit + fix | Generate a real PDF in Arabic (`ar`) and spot-check every section of `ScenarioPrintView` for layout / alignment / number-formatting bugs (text-align, flex-direction, table cell padding, caption italics). Fix issues found in the same PR. Done when an Arabic export visually matches English for the same scenario, with no regressions in `en` or `th`. | `src/components/workspace/ScenarioPrintView.tsx` (targeted CSS / `dir` handling), `src/locales/ar.json` (translation corrections only), `src/components/workspace/ScenarioPrintView.test.tsx` (RTL render assertion) | `phase-10/pdf-rtl-parity` | 10.3.1 (soft — land first so the cover-id surface is audited in the same pass) |

**Out of scope for 10.3 (stays in [#356](https://github.com/CortoMaltese3/riskwise-v2/issues/356)):** executive notes / commentary field, editable cover title / subtitle / author, per-export locale override, applied-measures listing on cover, additional timestamp fields on cover, snapshot tags / annotations, persistence and history of generated PDFs, partner-logo configuration, cross-page TOC with anchor links, removing the disabled camera button from chart surfaces, additional auto-charts beyond waterfall / cost-benefit.

### 10.4 — General UI enhancements (no parent yet)

> **Status**: deferred. A parent umbrella will be created if smaller cross-cutting items coalesce into a coherent set. Standalone polish items in the meantime can be opened as regular issues with the `phase-10` label.

---

## Issue template for sub-phase issues

All Phase 10 issues use the body shape below. The parent-umbrella link is mandatory — every sub-phase implements an item from one of the umbrella issues, and the link gives `/build` the exact rule to apply.

```markdown
## Goal
One sentence. What changes and why.

## Parent umbrella
Closes part of #<umbrella-issue> — <one-line summary of the work item this issue covers>.

## Context
Two or three paragraphs of background — what's broken, why, the relevant file references. Quote inline comments from the code if they encode design intent (e.g., `_filter_entity_measures` matches by name on purpose). `/build` does NOT see this conversation; the context must be self-contained.

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

Adaptation Measures (parent [#443](https://github.com/CortoMaltese3/riskwise-v2/issues/443)):

- [ ] Catalog response from `/api/v1/measures/{country}/{hazard}` contains each measure `name` at most once per response, OR carries an explicit discriminator the UI uses to render distinct entries.
- [ ] Per-card checkbox state in `AdaptationMeasuresInput` is keyed by `measure.id`; toggling one card never visually toggles another.
- [ ] Changing exposure or app option in the workspace resets `selectedMeasureIds`, `appliedMeasureIds`, and `isMeasureSelectionInitialized` (parity with country / hazard changes).
- [ ] `selectedMeasureIds` is always sent as an array (empty when no filter); `null` is no longer a wire value; Risk-view and Adaptation-view runs produce identical request shapes for the same selection.
- [ ] Catalog cards carry visible applicability indicators against the current entity; on Apply, the user is told (via toast or chart annotation) how many measures were skipped.
- [ ] The Adaptation page no longer has its own Apply button; measure selection lives in the Risk inputs as a collapsible panel; the dual-state (`selected` vs `applied` vs `initialized`) is collapsed to one source of truth.

Impact Functions (parent [#444](https://github.com/CortoMaltese3/riskwise-v2/issues/444)):

- [ ] `GET /api/v1/impact-function?country=X&hazard=Y&exposure=Z[&entityFile=...]` returns the active IF spec parsed from the same XLSX the engine consumes; a smoke test confirms engine-vs-viewer parity on a real run.
- [ ] `ImpactFunctionCard` appears between `ExposureCard` and the Run button in the Risk Assessment left input column; it shows IF id / name / unit once `(country, hazard, exposure)` are all valid and opens a dialog with the full `(intensity, mdd, paa)` table plus a curve plot. `ResultsView` carries a secondary "View impact function" entry point.
- [ ] Custom-mode `POST /api/v1/scenario/run` accepts an `impact_function_override` payload; ERA-mode runs reject it with 400; overrides are validated server-side against registry-strict rules with per-field structured errors.
- [ ] At run time, when an override is present, `entity_present.impfset_specs` is patched before `calculate_impact`; the uploaded entity XLSX is byte-identical before and after edits.
- [ ] Saved scenarios persist the override; restoring replays the exact IF the run used and shows a "Modified" badge on the IF card and `ResultsView` panels.

PDF Reports (parent [#445](https://github.com/CortoMaltese3/riskwise-v2/issues/445)):

- [x] Cover page in `ScenarioPrintView` shows the scenario identifier (`meta.id`) under the time-horizon line, styled consistently with the other cover fields and labelled via a new i18n key in `en`, `th`, and `ar`. _(landed: #465 closing #463)_
- [x] An Arabic-locale export of a representative scenario renders without layout, alignment, or number-formatting regressions; `en` and `th` exports remain unchanged. _(landed: #466 closing #464)_

General UI (no parent): TBD.

---

## Sequencing

```
10.1.1 ──┐
10.1.2 ──┤
10.1.3 ──┼──> 10.1.5 ──> 10.1.6
10.1.4 ──┘
```

10.1.1 / 10.1.2 / 10.1.3 / 10.1.4 are independent and can land in parallel.
10.1.5 depends on 10.1.1 (so the catalog list is itself unambiguous before applicability flags are layered on).
10.1.6 is the architectural alignment and depends on all five preceding child issues so it folds into a clean state.

10.2:

```
10.2.1 ──> 10.2.2
```

10.2.1 ships the viewer surface (endpoint, card, dialog) for ERA and custom modes. 10.2.2 extends the dialog with an Edit mode and the run pipeline with override application.

10.3:

```
10.3.1 ──> 10.3.2
```

10.3.1 ships the cover-page identifier surface. 10.3.2 is the RTL audit + fix and is soft-dependent on 10.3.1 so the new cover surface is included in the same audit pass.

---

## Where to start from cold

1. Confirm prerequisites above; in particular, verify that Phase 8 view migrations have merged so 10.1 frontend work won't conflict with layout-primitive churn.
2. Read each parent umbrella issue end to end before splitting (Adaptation [#443](https://github.com/CortoMaltese3/riskwise-v2/issues/443), Impact Functions [#444](https://github.com/CortoMaltese3/riskwise-v2/issues/444), PDF Reports [#445](https://github.com/CortoMaltese3/riskwise-v2/issues/445)).
3. For 10.1: resolve the open question on the duplicate-rows root cause as the first acceptance criterion in 10.1.1. Inspect actual DuckDB rows on a seeded dev DB before writing the SQL fix.
4. Open child issues with labels `phase-10` plus the per-item slug from the scope tables. Pick a parallelisable quick win first (10.1.3 reset bug is the smallest) to validate the `/build` flow before committing to 10.1.5 / 10.1.6.
5. As children merge, tick the matching exit-criteria checkbox in this file and update the status column in [`README.md`](README.md).
