# RISK WISE v2 — Execution Plan

> **Purpose**: Living index of per-phase execution plans. Each phase has its own self-contained file with prerequisites, scope, exit criteria, and a "start from cold" entry point. This README is the map.
> **Read alongside**: [`ARCHITECTURE.md`](../ARCHITECTURE.md) (what to build, full Area specs) and [`DECISIONS.md`](../DECISIONS.md) (what was decided, D-numbers referenced throughout).

---

## Current state (as of 2026-05-04)

**Active phase**: **Phase 7 — Optional / Later** (non-blocking; runs alongside maintenance).
**Progress snapshot**: Phases 0–4 and Phase 6 are complete. Phase 6 (engine migration, #150–#168) landed `climate-lama-engine` as the runtime compute backend, removed `climada==6.1.0` from runtime deps, refreshed the bundle benchmark, and closed the documentation loop. Phase 7 work is unstarted and non-blocking.

For per-phase exit-criteria status see each phase file's `Exit criteria` section.

---

## Phase index

| Phase | File | Weeks | Status |
|-------|------|-------|--------|
| 0 — Research Spikes | [phase-0-research-spikes.md](phase-0-research-spikes.md) | 1–2 | ✅ Done |
| 1 — Foundation | [phase-1-foundation.md](phase-1-foundation.md) | 3–7 | ✅ Done |
| 2 — Data & Backend Cleanup | [phase-2-data-backend-cleanup.md](phase-2-data-backend-cleanup.md) | 8–12 | ✅ Done |
| 3 — UI Overhaul | [phase-3-ui-overhaul.md](phase-3-ui-overhaul.md) | 13–17 | ✅ Done |
| 4 — Environment, Distribution & Polish | [phase-4-distribution-and-polish.md](phase-4-distribution-and-polish.md) | 18–20 | ✅ Done |
| 6 — Engine Migration (CLIMADA → climate-lama-engine) | [phase-6-engine-migration.md](phase-6-engine-migration.md) | post-v2.0 | ✅ Done |
| 7 — Optional / Later | [phase-7-optional.md](phase-7-optional.md) | post-v2.0 | ⏳ Unstarted (non-blocking) |
| 8 — UI Layout Architecture Refinement | [phase-8-ui-layout.md](phase-8-ui-layout.md) | post-v2.0 | ⏳ Unstarted |

Status legend: 🔄 in progress · ✅ done · ⏳ pending · 🔲 not started · ❌ blocked.

---

## How to use these files

Each phase file is written to be **self-contained**: someone picking up a phase from cold should be able to read just that file and know what to do, without cross-referencing the others.

Every phase file contains, in order:

1. **Header** — weeks, status, goal statement, canonical references, hard predecessor link.
2. **Why this phase exists** — one paragraph explaining what problem the phase solves.
3. **Prerequisites** — explicit checklist of what must be true from the prior phase before starting.
4. **Scope** — table of Areas with Phase-specific cuts, linked to ARCHITECTURE.md for full specs.
5. **Exit criteria** — "done means" checklist drawn from ARCHITECTURE.md § Verification Criteria.
6. **Where to start from cold** — step-by-step entry instructions.

Phase 0 additionally carries a pre-flight checklist, per-spike notes, recommended sequencing, and a coverage-gaps table — these are Phase-0-specific.

---

## Update protocol

When a phase moves forward:

- Update the status column in this README's phase index.
- Update the corresponding checkbox in the phase file's exit criteria.
- For Phase 0, also update the spike-status table in [phase-0-research-spikes.md](phase-0-research-spikes.md#spike-status).
- If a decision changed or a new trade-off emerged, land it in [DECISIONS.md](../DECISIONS.md) with a new D-number and reference it from the phase file.

These files are the canonical plan. If they disagree with a stale note elsewhere (GitHub comment, chat, older draft), these files win.

---

## Cross-phase dependencies

For quick navigation without reading every file:

- **Phase 1 cannot start** until spike **#5 (FastAPI PoC)** passes. See [phase-0 § #5 note](phase-0-research-spikes.md#5-fastapi--electron-loopback-poc).
- **Phase 2 cannot start** until FastAPI + Pydantic types + CI gates are live from Phase 1.
- **Phase 3 workspace UI** depends on DuckDB scenario store from Phase 2 Area 3.
- **Phase 4 Area 4 (lean backend execute)** was unblocked when Track A (CLIMADA + Nuitka) was confirmed as the default by CLIMADA 6.1.0 adoption. Spike #3 (bundling ADR) is at [`docs/spikes/adr-bundling.md`](../spikes/adr-bundling.md); spike #4 (`climate_lama_engine`) was initially closed as won't-do (2026-04-26 morning) and **reopened the same day** for post-v2.0 adoption — see [`docs/spikes/adr-climate-lama-engine-adoption.md`](../spikes/adr-climate-lama-engine-adoption.md). Phase 6 operationalises that decision; v2.0 still ships on Track A.
- **Phase 4 signing activation** depends on the cert obtained per DECISIONS.md D17 (Azure Trusted Signing primary, SSL.com EV fallback).
- **Phase 6 cannot start** until v2.0.0 is tagged AND #150 (the engine-adoption ADR) merges with the parity smoke recorded.
- **Phase 7 is independent** of Phase 6; both may run in parallel post-v2.0.
- **Phase 8 is independent** of Phase 6 and Phase 7. Hard predecessors: v2.0 release tag and Phase 6 documentation closure ([#205](https://github.com/CortoMaltese3/riskwise-v2/pull/205)). Phase 7's dark-mode candidate, if pursued, depends on Phase 8 layout primitives and theme polish landing first.

---

## Related documents

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — canonical Area specs (Areas 1–24), target architecture, performance benchmarks, error-code taxonomy, critical files to modify, verification criteria per phase.
- [`DECISIONS.md`](../DECISIONS.md) — D01–D17 rationale, rejected alternatives, consequences.
- [`docs/spikes/`](../spikes/) — per-spike research and ADR-style design docs.
- [`docs/audits/security-baseline-v1.md`](../audits/security-baseline-v1.md) — Phase 0 spike #10 output.
- [`docs/audits/accessibility-baseline-v1.md`](../audits/accessibility-baseline-v1.md) — Phase 0 spike #9 output.
- [`docs/spikes/mui-v7-spike-notes.md`](../spikes/mui-v7-spike-notes.md) — Phase 0 spike #6 working notes.
