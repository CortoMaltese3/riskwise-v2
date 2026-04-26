# Phase 1 — Foundation

> **Weeks**: 3–7 (5 weeks)
> **Status**: ✅ Complete
> **Goal**: Replace the communication backbone, add resilience, and install the quality gates (types, lint, tests, signing scaffold) that every later phase depends on.
> **Canonical references**: [ARCHITECTURE.md § Phase 1](../ARCHITECTURE.md#phase-1-foundation-weeks-3-7), [DECISIONS.md](../DECISIONS.md) D02, D04, D07, D08, D16
> **Hard predecessor**: Phase 0 ([phase-0-research-spikes.md](phase-0-research-spikes.md)) — specifically spike #5 (FastAPI PoC) must pass before any Phase 1 work begins.

---

## Why this phase exists

v1's stdin/stdout IPC, console-log error handling, unthemed MUI, and absent CI gates are the structural problems that make every other change expensive. Phase 1 replaces the backbone (Areas 1, 2, 5), starts the MUI v7 migration (Area 12.1), and installs the dev-loop infrastructure (Areas 9 start, 15 infra, 17 foundation, 18 baseline, 19). Nothing user-visible lands here beyond structured error toasts — this is the phase that makes Phases 2–4 cheap.

---

## Prerequisites (from Phase 0)

This phase cannot start until:

- [x] **#5 FastAPI PoC passed** on target Windows environment (or gap explicitly documented in the ADR). Loopback + SSE + startup handshake all verified.
- [x] **#6 MUI v7 theme prototype** closed — v5→v7 upgrade path documented; known breakages listed.
- [x] **#7 Code signing research** closed — provider chosen or "deferred" recorded. Wiring plan ready.
- [x] **#10 Security baseline** committed — audit numbers exist so Phase 1 hardening has something to measure against.
- [x] **Pinned CLIMADA version** propagated to the canonical `pyproject.toml` used here.

If Phase 0 is mid-flight, check [phase-0-research-spikes.md § Spike status](phase-0-research-spikes.md#spike-status).

---

## Scope — Areas and their Phase 1 cuts

Full specifications live in [ARCHITECTURE.md](../ARCHITECTURE.md). The summaries here are only enough to understand what issues #11–#19 attack.

| Area | Cut for Phase 1 | Key ARCHITECTURE.md anchor |
|---|---|---|
| **1 — Backend Communication** | Full implementation: FastAPI on `127.0.0.1:0`, startup handshake, REST endpoints, SSE `/scenario/{job_id}/stream`. | [§ Area 1](../ARCHITECTURE.md#area-1--backend-communication-fastapi-on-loopback-critical) |
| **2 — Error Handling & Resilience** | Process supervisor with exponential backoff (max 3), `asyncio.Lock` single-job contract, cancel-flag polling between CLIMADA steps, structured `{status, code, message, detail}` errors, Zustand error fields, React ErrorBoundary, memory pre-flight check. | [§ Area 2](../ARCHITECTURE.md#area-2--error-handling--resilience-critical) |
| **5 — Typed API Contract** | Pydantic models for every endpoint, `openapi-typescript` generating `src/types/api.d.ts` at build time, `RiskWiseClient` replaces `APIService.js`. Frontend stops referencing `.py` filenames. | [§ Area 5](../ARCHITECTURE.md#area-5--typed-api-contract-high) |
| **9 — Testing (start)** | pytest + Vitest installed, first unit tests on pure functions (`beautify_hazard_type`, `assign_levels`, `sanitize_country_name`, frontend formatters). CI gate on green. Integration + Playwright deferred to Phase 4. | [§ Area 9](../ARCHITECTURE.md#area-9--testing-strategy-high) |
| **12.1 — MUI v7 + Design Tokens** | Upgrade React + MUI to v7, add `ThemeProvider`, ship first pass of `src/theme/theme.ts` (cssVariables, palette, typography, shape), enforce zero `#XXXXXX` in the migrated screens. Layout/sidebar/dark-mode deferred to Phase 3. | [§ Area 12](../ARCHITECTURE.md#area-12--modern-uiux-overhaul-high) |
| **15 — Code Signing (infra only)** | `electron-builder` signing config wired up behind `if [ -n "$CSC_LINK" ]` guard; signed and unsigned builds both succeed in CI. Actual cert activation is Phase 4. | [§ Area 15](../ARCHITECTURE.md#area-15--code-signing-high) |
| **17 — Observability (foundation)** | `electron-log` (main, 7-day rotation), `structlog` JSON (Python), `src/lib/logger.ts` IPC wrapper, UUID request-ID flowing frontend → FastAPI → logs → error toasts. No raw `console.log` in production (ESLint rule). | [§ Area 17](../ARCHITECTURE.md#area-17--observability-logging--diagnostics-medium-high) |
| **18 — Security (baseline)** | Electron renderer hardening (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, `electron-fuses`, tightened `preload.js`). Dependabot (npm + pip). `npm audit --production` + `pip-audit` in CI. | [§ Area 18](../ARCHITECTURE.md#area-18--security-hardening-high) |
| **19 — DX & Community Standards** | `CONTRIBUTING.md` (with CLA clause), `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, issue + PR templates, Ruff + mypy + Husky + lint-staged, Conventional Commits + `release-please` workflow, `.nvmrc`, `.python-version`, canonical `pyproject.toml`. | [§ Area 19](../ARCHITECTURE.md#area-19--developer-experience--community-standards-medium) |

---

## Issues

Issues #11–#19 are already created and labeled `phase-1`. Each maps to one Area cut above.

| # | Title | Depends on Phase 0 spike |
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

---

## Suggested sequencing (to be refined at Phase 0 exit)

1. **#11 (FastAPI)** first — everything else that touches the backbone depends on it.
2. **#13 (Pydantic + typed client)** immediately after #11 while the endpoint shapes are fresh.
3. **#12 (supervision + errors)** next — closes the reliability story on top of the new backbone.
4. **#17 (logging + request-IDs)** in parallel with #12 — they share the error-path plumbing.
5. **#14 (test infra)** early if possible — every subsequent PR benefits from the CI gate.
6. **#19 (DX)** landed early so Conventional Commits + hooks are live before the bulk of PRs.
7. **#15 (MUI v7)** can proceed in parallel with backend work — different files, different skill focus.
8. **#18 (security baseline)** once renderer touch points are stable.
9. **#16 (signing infra)** last — pure CI config, no dependency on other Phase 1 work.

Detailed per-issue notes will be added to this file at Phase 0 exit, once the current environment and Phase 0 outputs are known.

---

## Exit criteria

Phase 1 is complete when all of the following are true (mirrors the Verification Criteria table in [ARCHITECTURE.md § Phase 1](../ARCHITECTURE.md#phase-1-foundation-weeks-3-7)):

- [x] Scenario runs end-to-end via HTTP; SSE stream delivers progress events to the frontend.
- [x] Killing the Python process triggers auto-restart; a structured error toast with Error ID appears.
- [x] Changing a Pydantic response field fails TypeScript compilation on the frontend (type safety is real, not aspirational).
- [x] One API call produces the same request ID in Electron main log, Python backend log, and the error toast.
- [x] `require('child_process').exec` from the renderer console fails (Electron hardening is real).
- [x] CI build with `CSC_LINK` set produces a signed installer; without `CSC_LINK` still succeeds unsigned. _(Signing infra scaffolded; guard pattern confirmed in `release.yml`. Full cert activation deferred to Phase 4 — see `docs/reference/signing.md`.)_
- [x] A `feat:` commit triggers `release-please` to generate the correct changelog entry.
- [x] CI gates: lint, type-check, `npm audit`, `pip-audit`, unit tests — all required to merge.
- [x] Zero `#XXXXXX` hex literals in the MUI v7-migrated screens (enforce via lint rule).
- [x] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, `CHANGELOG.md` all committed.

---

## Where to start from cold

1. Verify all Phase 0 exit criteria from [phase-0-research-spikes.md § Exit criteria](phase-0-research-spikes.md#exit-criteria). If any row is unchecked, Phase 1 is blocked — return to Phase 0.
2. Read ARCHITECTURE.md Areas 1, 2, 5 (they're the load-bearing ones).
3. Scan DECISIONS.md D02 (FastAPI), D04 (MUI v7), D07 (signing infra), D16 (loopback verified).
4. Open issue #11; it is the correct starting point regardless of local detail.
