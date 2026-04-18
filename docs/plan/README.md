# RISK WISE v2 — Execution Plan

> **Purpose**: Living index of per-phase execution plans. Each phase has its own self-contained file with prerequisites, scope, exit criteria, and a "start from cold" entry point. This README is the map.
> **Read alongside**: [`ARCHITECTURE.md`](../ARCHITECTURE.md) (what to build, full Area specs) and [`DECISIONS.md`](../DECISIONS.md) (what was decided, D-numbers referenced throughout).

---

## Current state (as of 2026-04-18)

**Active phase**: **Phase 0 — Research Spikes**.
**Week**: 1 of 2 (Phase 0 start window).
**Progress snapshot**: design-only ADRs landed for #3 (bundling), #6 (MUI v7), #7 (signing → D17), #8 (auto-update UX). Security baseline for #10 committed. Spikes #4, #5, #9 not started.

For full per-spike status see [phase-0-research-spikes.md § Spike status](phase-0-research-spikes.md#spike-status).

---

## Phase index

| Phase | File | Weeks | Status |
|-------|------|-------|--------|
| 0 — Research Spikes | [phase-0-research-spikes.md](phase-0-research-spikes.md) | 1–2 | 🔄 In progress |
| 1 — Foundation | [phase-1-foundation.md](phase-1-foundation.md) | 3–7 | ⏳ Pending Phase 0 |
| 2 — Data & Backend Cleanup | [phase-2-data-backend-cleanup.md](phase-2-data-backend-cleanup.md) | 8–12 | ⏳ Pending Phase 1 |
| 3 — UI Overhaul | [phase-3-ui-overhaul.md](phase-3-ui-overhaul.md) | 13–17 | ⏳ Pending Phase 2 |
| 4 — Environment, Distribution & Polish | [phase-4-distribution-and-polish.md](phase-4-distribution-and-polish.md) | 18–20 | ⏳ Pending Phase 3 |
| 5 — Optional / Later | [phase-5-optional.md](phase-5-optional.md) | post-v2.0 | ⏳ Unstarted (non-blocking) |

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
- **Phase 4 Area 4 (lean backend execute)** depends on the Track A/B decision from Phase 0 spikes **#3 + #4**, which is only final once both ADRs are filled in. Design-only state of #3 is captured at [`docs/architecture-decisions/adr-bundling.md`](../architecture-decisions/adr-bundling.md).
- **Phase 4 signing activation** depends on the cert obtained per DECISIONS.md D17 (Azure Trusted Signing primary, SSL.com EV fallback).

---

## Related documents

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — canonical Area specs (Areas 1–24), target architecture, performance benchmarks, error-code taxonomy, critical files to modify, verification criteria per phase.
- [`DECISIONS.md`](../DECISIONS.md) — D01–D17 rationale, rejected alternatives, consequences.
- [`docs/architecture-decisions/`](../architecture-decisions/) — per-spike ADR output directory.
- [`docs/security-baseline.md`](../security-baseline.md) — Phase 0 spike #10 output.
- [`docs/accessibility-baseline.md`](../accessibility-baseline.md) — Phase 0 spike #9 output.
- [`docs/mui-v7-spike-notes.md`](../mui-v7-spike-notes.md) — Phase 0 spike #6 working notes.
