# RISK WISE — documentation index

The two top-level files are the entry points:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — what the system looks like, the implementation roadmap, and the canonical Area specs (Areas 1–24).
- [`DECISIONS.md`](DECISIONS.md) — every architectural decision (D01 onward), with rationale and rejected alternatives. **D12** describes this organization.

Below the root, docs are grouped by lifecycle:

| Folder | Lifecycle | What lives here |
|---|---|---|
| [`reference/`](reference/) | Current truth, long-lived | How features work today: `accessibility.md`, `benchmarks.md`, `extending.md`, `offline.md`, `signing.md`. Update these as the code evolves. |
| [`audits/`](audits/) | Frozen baselines, dated snapshots | One-shot audits with a date in the header: `accessibility-baseline-v1.md`, `security-baseline-v1.md`. Treat as historical — do not mutate; supersede with a new `-v2` if a fresh audit is needed. |
| [`spikes/`](spikes/) | Research, design-time | Per-spike findings produced during Phase 0: `adr-bundling.md`, `adr-fastapi-poc.md`, `adr-autoupdate-ux.md`, `mui-v7-spike-notes.md`, plus the engine-manifest JSON schema. Naming starts with `adr-` for legacy reasons; the actual ADRs live in `DECISIONS.md`. |
| [`plan/`](plan/) | Phase plans | `phase-0-research-spikes.md` … `phase-5-optional.md`, plus `README.md`. Tracks the work, not the outcome — outcomes land in `reference/` or `DECISIONS.md`. |

## Where to put a new doc

- **Documenting a feature that just shipped or is part of the current spec** → `reference/`.
- **Recording a one-shot audit, baseline measurement, or scan that should not change later** → `audits/`, with a date in the filename or header.
- **Capturing research, design exploration, or measurement notes for a Phase 0–1 spike** → `spikes/`.
- **Phase planning, milestone tracking, or roadmap updates** → `plan/`.
- **A new architectural decision** → add a `D##` section to `DECISIONS.md`. If the supporting research is more than ~10 kB, put the long form in `spikes/` and link from the decision entry.

If a doc seems to belong in two buckets, lifecycle wins: a long-lived reference doc that quotes a frozen baseline goes in `reference/` and links into `audits/`.

## Hosted docs site

Not currently published. A future MkDocs Material site is tracked in [issue #136](https://github.com/CortoMaltese3/riskwise-v2/issues/136) — we'll wire it up once there's a concrete audience for hosted docs.
