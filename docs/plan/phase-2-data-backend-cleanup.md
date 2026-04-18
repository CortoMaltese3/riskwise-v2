# Phase 2 — Data & Backend Cleanup

> **Weeks**: 8–12 (5 weeks)
> **Status**: ⏳ Pending Phase 1 exit
> **Goal**: Install DuckDB as the scenario store, refactor the 805-line `run_scenario.py` monolith, move charts off matplotlib into the frontend, and extract v1's hardcoded scientific constants into versioned country configs.
> **Canonical references**: [ARCHITECTURE.md § Phase 2](../ARCHITECTURE.md#phase-2-data--backend-cleanup-weeks-8-12), [DECISIONS.md](../DECISIONS.md) D03, D06, D13, D14, D10
> **Hard predecessor**: [phase-1-foundation.md](phase-1-foundation.md) — FastAPI + typed contracts + CI gates must be in place.

---

## Why this phase exists

After Phase 1, the backbone is sound but v1's data model (folder-copy save/restore, matplotlib PNGs, ERA constants hardcoded into `run_scenario.py`) still blocks the UI workspace, reproducibility, and every future user-upload feature. Phase 2 replaces the storage layer, cleans up the compute path, and makes charts interactive. No Phase 3 UI work is cheap to build on top of a folder-copy backend — so this phase comes first.

---

## Prerequisites (from Phase 1)

- [ ] FastAPI + SSE live; scenario runs end-to-end via HTTP.
- [ ] Pydantic models + auto-generated TypeScript types — needed so new DuckDB-backed endpoints produce typed clients without hand-maintenance.
- [ ] Structured errors + request-ID correlation — DuckDB failures must surface as structured errors, not silent write corruption.
- [ ] pytest + Vitest CI gate — schema migration tests and chart-data tests rely on it.
- [ ] MUI v7 + ThemeProvider live — new React chart components ship against v2 theme tokens, not retrofitted later.

---

## Scope — Areas and their Phase 2 cuts

Full specifications live in [ARCHITECTURE.md](../ARCHITECTURE.md). The summaries here are only enough to understand what is in play.

| Area | Cut for Phase 2 | Key ARCHITECTURE.md anchor |
|---|---|---|
| **3 — DuckDB Data Layer** | Full implementation. `backend/db/` module, `backend/db/migrations/0001_initial.sql`, `schema_version` table, migration runner that executes on every startup. Tables: `scenarios`, `scenario_results`, `computation_cache`, `snapshots`, `cred_datasets` (foundation only; populated in Area 23 cut). | [§ Area 3](../ARCHITECTURE.md#area-3--data-layer-duckdb-high) |
| **7 — Backend Refactor** | Unify ERA/custom paths via strategy pattern. Extract country configs to `countries/EGY/config.json` + `countries/THA/config.json`. Move `assign_levels` to `base_handler`. Refactor 661-line impact function if/elif chain into registry loaded from config. Separate `RequestData` dataclass from handlers. Fix the `hazard_intensity_unit` bug at `run_scenario.py:510-547`. Add scientific domain validation (monotonicity, unit consistency, ID uniqueness). | [§ Area 7](../ARCHITECTURE.md#area-7--backend-refactor-high) |
| **6 — Frontend Charts** | Waterfall and cost-benefit charts move from matplotlib PNG to interactive Chart.js in React. Backend returns structured JSON; frontend renders. Remove matplotlib from the bundle (~30 MB saving). | [§ Area 6](../ARCHITECTURE.md#area-6--charts-all-visualization-to-frontend-high) |
| **11 — Workspace (start)** | DuckDB save/restore replaces folder copy. User-facing `name`/`tags`/`notes` fields on the `scenarios` table surfaced in a basic "save as…" dialog. Full workspace UI (search, filter, PDF export, backup/restore) deferred to Phase 3. | [§ Area 11](../ARCHITECTURE.md#area-11--scenario-workspace-management-high) |
| **20 — Scientific Reproducibility** | Every scenario row captures `app_version`, `engine_version`, `climada_version`, entity/hazard/config SHA-256, `random_seed`, `computed_at`. `data/manifest.json` generated with SHA-256 for every shipped dataset; verified on startup. Seed discipline: `np.random.default_rng(seed)` everywhere; no global `np.random.*`. Same-machine determinism CI test runs identical scenario twice and asserts bit-identical outputs. | [§ Area 20](../ARCHITECTURE.md#area-20--scientific-reproducibility-medium-high) |
| **22 — Extensibility (foundation)** | Auto-scan `%APPDATA%/RISK WISE/user-data/countries/{ISO3}/` at startup. Strict schema validation with actionable error messages. Namespace isolation: "Built-in" vs "Custom" labels in country dropdowns. No UI panel in Phase 2 — drop-in directory only. | [§ Area 22](../ARCHITECTURE.md#area-22--extensibility-custom-hazards-measures--impact-functions-medium) |
| **23 — CRED Pipeline (foundation)** | Migrate built-in CRED data from `requirements/cred_output.xlsx` into DuckDB on first launch. `cred_datasets` table populated with the built-in row (`is_builtin = TRUE`). `POST /api/v1/macro/chart-data` endpoint reads from DuckDB, not Excel. User-upload UI deferred to Phase 3. | [§ Area 23](../ARCHITECTURE.md#area-23--macroeconomic-cred-pipeline-high) |
| **24 — Adaptation Measures (foundation)** | Migrate `requirements/adaptation_measures.xlsx` into DuckDB `adaptation_measures` table. Add `source_reference` field; backfill with citations for all built-in measures. `GET /api/v1/measures/{country}/{hazard}` reads from DuckDB. Custom-measure upload UI deferred to Phase 3. | [§ Area 24](../ARCHITECTURE.md#area-24--adaptation-measures-high) |

---

## Exit criteria

From [ARCHITECTURE.md § Verification Criteria](../ARCHITECTURE.md#verification-criteria-acceptance-tests-per-phase):

- [ ] Scenario runs end-to-end → results stored in DuckDB; direct SQL query confirms rows.
- [ ] Scenario restore is a DuckDB query, not a folder copy; completes in ≤ 1 s.
- [ ] Waterfall chart is interactive (hover shows values); exportable as image.
- [ ] Every scenario row has non-null provenance fields (`app_version`, `engine_version`, SHAs, seed, timestamp).
- [ ] Identical scenario run twice on the same machine produces bit-identical outputs (determinism CI test green).
- [ ] Egypt discount rate, return periods, growth rates read from `countries/EGY/config.json`; zero in `run_scenario.py`.
- [ ] Manual v1 DuckDB row survives the v2 migration runner and is readable with the new schema.
- [ ] Dropping a valid country config into the user-data directory makes a scenario runnable under a "Custom" label after restart.
- [ ] CRED chart renders from DuckDB, not from `requirements/cred_output.xlsx`.
- [ ] A scenario has a user-editable `name` that persists across restart.
- [ ] matplotlib no longer appears in the Python bundle's dependency list.

---

## Where to start from cold

1. Verify all Phase 1 exit criteria from [phase-1-foundation.md § Exit criteria](phase-1-foundation.md#exit-criteria). If any row is unchecked, this phase is blocked.
2. Read ARCHITECTURE.md Areas 3 and 7 (they are the load-bearing ones and must be understood together — the DuckDB schema presumes the refactored handlers).
3. Scan DECISIONS.md D03 (DuckDB rationale), D06 (matplotlib removal), D14 (ERA constants in country configs).
4. Start with Area 3 (DuckDB + migration runner) — everything downstream (workspace, provenance, CRED, measures) writes to the same database.
5. Open new issues per Area cut; label them `phase-2`. Phase 2 issue numbers are not yet created as of 2026-04-18.
