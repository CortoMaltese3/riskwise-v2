# Phase 3 — UI Overhaul

> **Weeks**: 13–17 (5 weeks)
> **Status**: ⏳ Pending Phase 2 exit
> **Goal**: Complete the visual transformation on the MUI v7 foundation, ship the workspace UI on top of DuckDB, set the accessibility and i18n baseline, and land the onboarding / help surfaces.
> **Canonical references**: [ARCHITECTURE.md § Phase 3](../ARCHITECTURE.md#phase-3-ui-overhaul-weeks-13-17), [DECISIONS.md](../DECISIONS.md) D04, D11, D10
> **Hard predecessor**: [phase-2-data-backend-cleanup.md](phase-2-data-backend-cleanup.md) — DuckDB + Chart.js in React + user-data directory must be live.

---

## Why this phase exists

Phase 1 put MUI v7 + a theme in place on one screen; Phase 2 replaced the storage layer. Phase 3 is where v2 stops looking like v1: sidebar nav replaces tabs, the workspace becomes a first-class surface, every chart and dialog gets polished, and accessibility/i18n move from "present" to "WCAG 2.1 AA baseline". This is the phase where a user-facing preview is worth showing.

---

## Prerequisites (from Phase 2)

- [ ] DuckDB scenario store live; instant restore works.
- [ ] Frontend Chart.js components live for waterfall + cost-benefit; matplotlib removed.
- [ ] `scenarios.name` / `tags` / `notes` columns in use; basic "save as…" dialog exists.
- [ ] Country configs (`countries/EGY/config.json`, `countries/THA/config.json`) drive all scientific constants.
- [ ] User-data auto-scan directory (`%APPDATA%/RISK WISE/user-data/`) respected with "Built-in" vs "Custom" labels.
- [ ] CRED data + adaptation measures migrated into DuckDB.

---

## Scope — Areas and their Phase 3 cuts

Full specifications live in [ARCHITECTURE.md](../ARCHITECTURE.md).

| Area | Cut for Phase 3 | Key ARCHITECTURE.md anchor |
|---|---|---|
| **12.2–12.6 — UI/UX Overhaul** | Sidebar nav + top app bar (VS Code-style) replaces fixed tabs. Resizable panels, full-bleed maps. Skeleton loading states, micro-interactions, toast notifications (on top of Phase 1 error toasts), animated progress overlay. Inter font. Every component migrated to theme tokens — zero `#XXXXXX` hex in component code across the codebase. Dark mode stays Phase 5. | [§ Area 12](../ARCHITECTURE.md#area-12--modern-uiux-overhaul-high) |
| **11 — Workspace (complete)** | Workspace page with searchable / sortable / filterable scenario list. Granular snapshot deletion. PDF export via `webContents.printToPDF()` — no MS Word. Workspace export / import (`.riskwise-workspace` ZIP: `riskwise.db` + referenced parquet + snapshots). Remove `docx2pdf`, `docxtpl`, `python-docx` from backend. | [§ Area 11](../ARCHITECTURE.md#area-11--scenario-workspace-management-high) |
| **8 — Performance** | In-memory LRU cache for Entity and Hazard objects. DuckDB computation cache keyed by input hash. Parallel GeoJSON generation via `ThreadPoolExecutor`. Stream partial results via SSE (exposure map first, then hazard, then impact). Convert entity `.xlsx` → `.parquet` on first load (10–50× faster). | [§ Area 8](../ARCHITECTURE.md#area-8--performance-caching--parallelism-medium) |
| **16 — Accessibility (baseline)** | ARIA landmarks, labels on custom controls, live regions for progress/errors. Keyboard-first: every interactive element reachable, focus traps in modals, visible focus rings. Non-color chart alternatives: patterns + labels; data table fallback for every chart. RTL layout audit for Arabic — icons, progress bars, chart axes mirror correctly. i18n formatters: numerals (Western digits decision documented), dates (Thai Buddhist Era via locale-aware formatter), plurals (i18next `_one`/`_other` keys from day one), Chart.js tick formatters locale-aware. `axe-core` via `@axe-core/react` in Vitest; CI fails on new violations. | [§ Area 16](../ARCHITECTURE.md#area-16--accessibility--inclusive-design-high) |
| **21 — In-App Help & Onboarding** | First-run walkthrough (3–4 steps, skippable, restartable from Help menu). Contextual tooltips on every parameter field in i18n system (en/ar/th). Guided tours via `react-joyride` or `shepherd.js`: "Run your first scenario", "Compare two scenarios", "Export a report", "Add a custom country". "What does this mean?" info icon on every chart → glossary popover. Searchable in-app glossary: `src/content/glossary/{en,ar,th}.md`. F1 Help menu. Empty states that teach. | [§ Area 21](../ARCHITECTURE.md#area-21--in-app-help--onboarding-medium-high) |
| **22 — Extensibility (UI)** | Settings > Custom Data panel: import (drag-and-drop ZIP), validate, delete. `docs/reference/extending.md` documents schemas for custom countries, measures, and hazards with Egypt/Thailand as canonical examples. `.riskwise-country-pack` export format (shareable, signed — signature verification is in Phase 4 Area 18). | [§ Area 22](../ARCHITECTURE.md#area-22--extensibility-custom-hazards-measures--impact-functions-medium) |
| **23 — CRED Pipeline (UI)** | Settings > CRED Data panel: upload own `.xlsx` (schema validated), stored in `%APPDATA%/RISK WISE/cred/`. Multiple uploads versioned in a dropdown ("Built-in v2024", "My country CRED 2026", …). Active dataset selected per session. `GET/POST/DELETE /api/v1/macro/datasets` endpoints. `POST /api/v1/macro/chart-data` gains a `dataset_id` param. | [§ Area 23](../ARCHITECTURE.md#area-23--macroeconomic-cred-pipeline-high) |
| **24 — Adaptation Measures (UI)** | Settings > Measures panel: upload custom measure sets (documented schema, validated on import). "Built-in" vs "Custom" labels in the scenario configuration dropdowns. `GET /api/v1/measures/{country}/{hazard}?dataset_id=…` accepts custom measure sets. | [§ Area 24](../ARCHITECTURE.md#area-24--adaptation-measures-high) |

---

## Exit criteria

From [ARCHITECTURE.md § Verification Criteria](../ARCHITECTURE.md#verification-criteria-acceptance-tests-per-phase):

- [ ] Visual regression screenshots show the new layout; animations at 60 fps; zero `#XXXXXX` hex in component code anywhere in `src/`.
- [ ] Workspace UI lets the user save 3 scenarios, search/filter by country, and export a PDF without MS Word.
- [ ] Golden-path scenario flow can be completed keyboard-only (no mouse).
- [ ] Fresh install: first-run tour appears; can be skipped and restarted from the Help menu.
- [ ] Arabic locale: every primary screen screenshots correctly — icons, progress bars, chart axes mirror.
- [ ] Workspace ZIP exported on one DB and re-imported on a fresh DB restores all scenarios.
- [ ] Upload a custom CRED xlsx, select it, verify chart shows the custom data.
- [ ] Complete a run; rename it in the workspace list; name persists across restart.
- [ ] Cached repeat run is measurably faster than the uncached run (Area 8 caching works).

---

## Where to start from cold

1. Verify all Phase 2 exit criteria from [phase-2-data-backend-cleanup.md § Exit criteria](phase-2-data-backend-cleanup.md#exit-criteria).
2. Read ARCHITECTURE.md Area 12 (visual direction) and Area 11 (workspace mechanics) first — they drive every layout decision.
3. Review the Phase 0 accessibility baseline at [docs/audits/accessibility-baseline-v1.md](../audits/accessibility-baseline-v1.md) to understand which violations must be fixed to reach WCAG 2.1 AA.
4. Plan the migration screen-by-screen: each screen is one PR that lands MUI v7 theme tokens + ARIA + i18n formatters together. Don't land the three concerns separately — that guarantees retrofitting.
5. Phase 3 issues are not yet created as of 2026-04-18. Create them at Phase 2 exit with labels `phase-3` + one Area tag.
