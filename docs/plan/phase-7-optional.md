# Phase 7 — Optional / Later

> **Weeks**: TBD (post-v2.0; renumbered from Phase 5 when Phase 6 — Engine Migration was inserted, see [adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md))
> **Status**: ⏳ Unstarted; nothing here blocks v2.0 release.
> **Goal**: Capture features that are worth doing but are neither required for v2.0 nor bound to a specific timeline. Each item is independent and may ship in its own minor release.
> **Canonical references**: [ARCHITECTURE.md § Phase 5](../ARCHITECTURE.md#phase-7-optional--later) (anchor name retained for compatibility with existing in-doc links; rename to `phase-7-optional--later` when ARCHITECTURE.md is touched next), [ARCHITECTURE.md § Area 10](../ARCHITECTURE.md#area-10--cross-platform-low-phase-7)
> **Hard predecessor**: v2.0 must have shipped (Phase 4 exit criteria met). Phase 6 (engine migration) is independent — items here are not gated on Phase 6.

---

## Why this phase exists

Some features have been scoped and designed but deliberately deferred from v2.0 — either because demand is unclear (cross-platform, remote backend), cost/benefit tips the wrong way on a first release (dark mode, scenario comparison), or the primary release should stabilise before the surface expands. They are catalogued here so they are not lost or re-invented.

Nothing in this phase is sequenced. Each item is a candidate for a minor release after v2.0 on its own timeline.

---

## Candidate items

### Cross-platform builds (macOS, Linux)

**Source**: ARCHITECTURE.md Area 10.

**Gate**: demand from existing clients or a commercial opportunity that requires non-Windows targets. The architecture is already cross-platform-friendly (`app.getPath()`, no Windows-only APIs), but build-chain work is nontrivial: macOS needs notarization (Apple Developer ID + altool), Linux needs AppImage / Snap / Flatpak decisions, and the CLIMADA dependency tree differs per platform.

**Estimated effort**: L per platform (Windows was the baseline; each additional OS is its own release pipeline).

**Entry criteria**: A documented deployment scenario that cannot be satisfied with Windows + RDP.

---

### Dark mode

**Source**: ARCHITECTURE.md Area 12 (listed as "Optional Phase 5").

**Gate**: the MUI v7 theme shipped in Phase 1/3 uses `cssVariables: true` and mode tokens, so dark mode is primarily a design + contrast-audit exercise rather than a refactor.

**Estimated effort**: M. Main costs are (a) verifying every chart / map / Leaflet layer works in dark mode, (b) re-running WCAG 2.1 AA contrast audit for the dark palette, and (c) deciding how the user-facing toggle interacts with OS-level dark mode (follow system vs explicit choice).

**Entry criteria**: none beyond v2.0 stability.

---

### Scenario comparison overlay view

**Source**: ARCHITECTURE.md Area 11, "Scenario comparison via SQL" — the data model is already in place (DuckDB, per-scenario provenance rows, snapshots keyed to scenario IDs).

**Gate**: user demand. Internally, the case is clear (the macroeconomic tab already shows with/without adaptation timeseries — scenario comparison generalises this to arbitrary scenario pairs). Externally, UNU-EHS / GIZ analysts have asked for it in earlier feedback rounds.

**Estimated effort**: M–L. Backend: a `POST /api/v1/scenarios/compare` endpoint that accepts two scenario IDs and returns aligned JSON. Frontend: a new comparison view with side-by-side maps, overlay waterfall deltas, and a "which assumptions differ" audit panel reading from the provenance rows.

**Entry criteria**: Phase 3 workspace UI must be stable; comparison view is a new top-level tab in the sidebar.

---

### Hosted / remote backend variant for enterprise

**Source**: ARCHITECTURE.md Area 10 (Phase 5+), DECISIONS.md D05 (Track C — explicitly rejected for v2.0 offline-first delivery).

**Gate**: a commercial opportunity that requires multi-user / server-side computation. The FastAPI boundary from Phase 1 is already HTTP — lifting it off `127.0.0.1` to a hosted deployment is mostly (a) authentication (v2.0 has none, because loopback doesn't need any), (b) multi-tenancy (job isolation + DuckDB per-tenant), and (c) ops (container image, secrets management, cost model).

**Estimated effort**: L. This is a new product shape, not a feature.

**Entry criteria**: a paying customer asking for it. Speculative build is not appropriate given D01 (speculative-proprietary posture).

---

## Where to start from cold

Phase 7 items are each a new mini-initiative. If one is picked up:

1. Confirm v2.0 is released and stable (all [Phase 4 exit criteria](phase-4-distribution-and-polish.md#exit-criteria) met).
2. Open a tracking issue labeled `phase-7` + the item name (e.g. `phase-7/dark-mode`).
3. Treat the item as a self-contained mini-phase: write its own prerequisites, scope, and exit criteria in the issue description before writing code.
4. Update this file's entry with status and issue link; do not let Phase 7 items silently fall out of the plan.
