# RISK WISE v2 — Execution Plan

> **Purpose**: Living document tracking the current phase status, open blockers, sequencing decisions, and next steps. Updated as each phase progresses.
> Read alongside [ARCHITECTURE.md](ARCHITECTURE.md) (what to build) and [DECISIONS.md](DECISIONS.md) (what was decided).

---

## Current phase: Phase 0 — Research Spikes

**Goal**: De-risk the highest-uncertainty decisions before committing to Phase 1.
**Target**: Weeks 1–2.
**Status**: 🔲 Not started

---

### Pre-flight checklist

Do these **before** starting any spike. They are blockers or shared inputs across multiple spikes.

- [ ] **Resolve ADR output location** — DECISIONS.md D12 says single-file; Phase 0 spike issues all require per-file docs in `docs/architecture-decisions/`. Amend D12: spike research docs live in `docs/architecture-decisions/`; summary decisions still get a DECISIONS.md entry that links to the file.
- [ ] **Pin CLIMADA version** — ARCHITECTURE.md says 4.0.1; DECISIONS.md D05 acceptance threshold says 4.1.1. Pick one version and update both documents consistently.
- [ ] **Capture CLIMADA baseline numbers** — Run v1 end-to-end on Egypt flood ERA scenario; record AAL and expected damage at 50/100/250 yr return periods. Commit to `docs/architecture-decisions/baseline-climada.md` with entity/hazard file SHAs, CLIMADA version used, and host machine specs. This is a hard input for spike #4 (lama engine comparison) and #3 (performance benchmarks).
- [ ] **Create `phase-0` GitHub milestone** — Attach issues #3–#10 and self-assign. Open a meta tracking issue `chore: Phase 0 tracking` with a checklist linking each spike and its output doc.
- [ ] **Confirm benchmark hardware** — ARCHITECTURE.md targets Windows 11, Intel i5 (4 cores), 16 GB RAM, SSD. Confirm whether the dev machine matches spec, or plan a VM / secondary machine for representative measurements. Document the answer in `docs/architecture-decisions/baseline-climada.md`.
- [ ] **Confirm enterprise-firewall test host** — Spike #5 (FastAPI PoC) needs validation on a locked-down Windows machine. If one is not accessible, record that gap explicitly in the output doc rather than leaving it implied.

---

### Spike status

| # | Title | Priority | Effort | Status | Output doc |
|---|-------|----------|--------|--------|-----------|
| 5 | FastAPI + Electron loopback HTTP PoC | Critical | M | 🔲 | `docs/architecture-decisions/adr-fastapi-poc.md` |
| 10 | Security baseline audit | High | S | 🔲 | `docs/security-baseline.md` |
| 9 | Accessibility baseline audit | High | S | 🔲 | `docs/accessibility-baseline.md` |
| 7 | Code signing research | High | S | 🔲 | `docs/architecture-decisions/adr-signing.md` |
| 8 | Auto-update UX design | Medium | S | 🔲 | `docs/architecture-decisions/adr-autoupdate-ux.md` |
| 6 | MUI v7 theme prototype | High | M | 🔲 | `docs/architecture-decisions/adr-mui-v7.md` |
| 3 | Python bundling — Nuitka vs PyInstaller | High | L | 🔲 | `docs/architecture-decisions/adr-bundling.md` |
| 4 | climate_lama_engine hazard coverage | High | M | 🔲 | `docs/architecture-decisions/adr-lama-engine.md` |

Ordered by recommended sequencing (see below). Status: 🔲 not started · 🔄 in progress · ✅ done · ❌ blocked.

---

### Recommended sequencing (single maintainer)

**Week 1**

1. **Day 1 — Pre-flight** (see checklist above): resolve ADR location, pin CLIMADA version, create milestone + meta issue, capture baseline numbers, confirm hardware.
2. **#5 FastAPI PoC** (~2 days) — Critical; blocks all of Phase 1 Area 1. Consider a 1-day Windows Named Pipes fallback skeleton as insurance in case loopback is blocked in an edge-case deployment.
3. **#10 Security baseline** (~1 day) — Small, standalone; feeds Phase 1 Area 18 hardening scope.
4. **#9 Accessibility baseline** (~1 day) — Small, standalone; feeds Phase 3 Area 16 scope.

**Week 2**

5. **#7 Signing research** (~0.5–1 day) — Mostly desk research and provider quotes. Explicitly state whether "who pays" is resolved or deferred; the spike is not blocking if the answer is "deferred".
6. **#8 Auto-update UX** (~0.5–1 day) — Depends on #7 for trust model. Runs immediately after #7 closes.
7. **#6 MUI v7 theme prototype** (~1.5–2 days) — Can run in parallel with #3/#4 (different skill focus). Direct v5→v7 upgrade path is documented; timebox the codemod step separately from the theme design work. Decide before starting whether `theme.ts` requires TypeScript introduction now or ships as `.js` with migration to Phase 1.
8. **#3 Python bundling** + **#4 lama engine** (~3–4 days combined) — Heaviest spikes; run in tandem with shared baseline inputs. Joint output covers Track A vs Track B decision against the quantitative thresholds in DECISIONS.md D05. Time-box the Nuitka attempt (max 3 days) due to known risk with CLIMADA's C-extension stack (GDAL, rasterio, h5py, scipy).

---

### Per-spike notes

#### #5 FastAPI + Electron loopback PoC
- Blocks Phase 1 Area 1, Area 2, and Area 5 — highest-priority spike.
- Validate SSE endpoint as part of the PoC (`GET /stream/test` emitting 5 events, verified with `curl --no-buffer`).
- If enterprise-firewall test host is unavailable, flag the gap rather than claiming full validation.
- Named Pipes fallback: D02 reserves it as a fallback but no skeleton exists. Add one if time permits; it prevents Phase 1 being fully blocked on loopback issues.
- **Coverage gap**: spike #5 tests basic SSE but not the cancel-flag polling pattern between CLIMADA steps (Area 2). Consider adding a "start → cancel → restart" test within the PoC to validate the `asyncio.Lock` single-job contract.

#### #10 Security baseline
- Add `npm audit --production` and `pip-audit` output to the deliverable — these numbers are the baseline that Phase 1 Dependabot/CI work is measured against.
- Include concrete path traversal test vectors used (e.g. `..\..\Windows\System32`) so Phase 1 validation tests can reuse them.
- grep for `shell.openExternal` in `build/electron.js` before writing the doc; if none exist, say so explicitly.

#### #9 Accessibility baseline
- Confirm v1 still boots under `npm run start` before adding `@axe-core/react` (dev-mode requirement).
- De-noise axe-core output: React dev-mode warnings can show up as violations; exclude them before counting.
- Record the `axe-core` version used so Phase 3/4 comparisons stay on the same ruleset.
- RTL screenshots: manual is fine for baseline; document the steps so Phase 3 CI visual-regression tests can extend the approach.

#### #7 Code signing
- EV cert identity verification takes 1–3 weeks; record this in the doc so Phase 4 cert activation can be scheduled around procurement lead time, not build work.
- If "who pays" is unresolved, the spike output is a provider shortlist + quotes, not a go/no-go. State this clearly so the spike isn't mis-read as a blocker.

#### #8 Auto-update UX
- Depends on #7 (trust model context). Do not start until #7 is complete.
- The engine-manifest schema draft in the issue omits two fields from ARCHITECTURE.md: `max_app_version` (inverse-bind protection) and a signature field. Both must be in the final schema before the spike closes.
- Add one UX rule to the consent dialog spec: engine updates queue and never interrupt an active scenario run.

#### #6 MUI v7 theme
- Choose a representative target screen before starting (recommended: the DataInput/scenario-config left panel — it has MUI form controls, i18n, and sits beside a Leaflet map).
- v5→v7 is two major versions; MUI codemods target v5→v6→v7. Timebox the upgrade step (1 day max) separately from the theme work.
- TypeScript decision: ship `theme.ts` only if TypeScript is already planned for this spike; otherwise ship `theme.js` and migrate in Phase 1.

#### #3 Python bundling
- Use Egypt flood ERA as the representative scenario for all timing measurements (consistent with the ≤ 90 s benchmark target).
- Timebox Nuitka at 3 days; document failure modes if it hits C-extension walls — do not chase bundler bugs open-endedly.
- Decide upfront whether the `pyproject.toml` produced here is the canonical v2 file or a throwaway (it overlaps with Phase 1 Area 19).

#### #4 climate_lama_engine evaluation
- Blocked by: CLIMADA baseline capture (pre-flight item above).
- Document mapping/unit assumptions (units, CRS) before running comparisons — small preprocessing differences can cause artificial ±% failures against the D05 thresholds.
- Set a ceiling on drought/heatwave gap analysis depth; the M-effort estimate in the issue can blow out if it requires deep C-code reading.

---

### Coverage gaps (decided to defer)

These areas are not covered by the 8 spikes. Flagged here so they are not forgotten when Phase 1/2/4 planning begins:

| Gap | Risk | Phase where it lands | Decision |
|-----|------|---------------------|----------|
| DuckDB migration-runner validation | Low (mature lib) | Phase 2 Area 3 | Defer; add 1-day sanity check at Phase 2 start |
| `webContents.printToPDF` visual fidelity (D10) | Medium | Phase 3 Area 11 | Consider adding a 2-hour PoC in Phase 0 if slack permits |
| MBTiles tile-pack size estimate for EGY+THA | Medium (offline installer target) | Phase 4 Area 14 | Do a 1-hour size estimate before finalising the 900 MB target |
| Engine-manifest signing tool (minisign vs age) | Low | Phase 4 Area 13 | Decide in #8 spike or at Phase 3 start |
| SSE cancel + CLIMADA thread-safety contract | Medium | Phase 1 Area 2 | Extend #5 PoC if time permits; otherwise accept as Phase 1 risk |

---

### Phase 0 exit criteria

Phase 0 is complete when all of the following are true:

- [ ] All 8 spike issues closed with output docs committed to `docs/architecture-decisions/`
- [ ] CLIMADA baseline numbers captured and committed
- [ ] Track A vs Track B decision made (DECISIONS.md D05 updated with measured results)
- [ ] FastAPI loopback validated on target Windows environment (or gap explicitly documented)
- [ ] MUI v7 upgrade path validated (app boots, Leaflet + i18n intact)
- [ ] Signing provider shortlist complete; infrastructure wiring plan ready for Phase 1
- [ ] Auto-update schema + UX spec complete; feeds Phase 1 `UpdateDialog.jsx`
- [ ] axe-core violation count and NVDA notes committed to `docs/accessibility-baseline.md`
- [ ] Security posture inventory committed to `docs/security-baseline.md`

---

## Upcoming: Phase 1 — Foundation (Weeks 3–7)

Issues #11–#19 are already created and labeled `phase-1`. No action needed until Phase 0 exit criteria above are met.

Key dependency: #5 (FastAPI PoC) must pass before any Phase 1 work begins.

| # | Title | Depends on spike |
|---|-------|-----------------|
| 11 | Replace stdin/stdout with FastAPI on loopback HTTP | #5 |
| 12 | Process supervision, job isolation, structured errors | #5 |
| 13 | Pydantic models + auto-generated TypeScript client | #5 |
| 14 | pytest + Vitest testing infrastructure | — |
| 15 | MUI v7 + ThemeProvider + design tokens | #6 |
| 16 | Code signing infra, cert-optional CI build | #7 |
| 17 | Structured logging + request-ID correlation | #5 |
| 18 | Electron renderer security hardening + Dependabot | #10 |
| 19 | Dev tooling: Ruff, mypy, Husky, Conventional Commits | — |

Phase 1 planning (blockers, sequencing, per-issue notes) will be added here when Phase 0 exits.

---

## Phases 2–5 (placeholder)

Sections for Phases 2–5 will be added here at the start of each phase. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full scope of each phase.

| Phase | Focus | Weeks | Status |
|-------|-------|-------|--------|
| 0 | Research spikes | 1–2 | 🔲 |
| 1 | Foundation — FastAPI, error handling, MUI v7 | 3–7 | ⏳ Pending Phase 0 |
| 2 | Data & backend cleanup — DuckDB, refactor, charts | 8–12 | ⏳ |
| 3 | UI overhaul, workspace, accessibility | 13–17 | ⏳ |
| 4 | Environment, distribution, hardened tests | 18–20 | ⏳ |
| 5 | Optional: cross-platform, dark mode, scenario comparison | TBD | ⏳ |
