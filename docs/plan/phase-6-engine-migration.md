# Phase 6 — Engine Migration (CLIMADA → climate-lama-engine)

> **Weeks**: post-v2.0; landed across Tracks 1–5 in 2026-04 / 2026-05.
> **Status**: ✅ Done
> **Goal**: Replace the runtime CLIMADA dependency with `climate-lama-engine`, shrink the installer ~50–70 %, formalise the cross-project compatibility contract with the climate-lama backbone, and make future hazard extensibility a JSON + loader change rather than a Python class change.
> **Canonical references**: [adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md), [DECISIONS.md D18](../DECISIONS.md) (supersedes D05), [adr-bundling.md](../spikes/adr-bundling.md) (§6 re-baselined).
> **Hard predecessor**: Phase 4 — v2.0.0 must be tagged on Track A (CLIMADA + Nuitka) before any Phase 6 work begins.

---

## Why this phase exists

Riskwise-v2 currently depends on `climada==6.1.0` for the entire risk-assessment pipeline. The maintainer's own NumPy/SciPy-only compute library, `climate-lama-engine`, has matured to v0.4.0 and is in production use inside the `climate-lama` backbone product. Removing CLIMADA from riskwise-v2 yields a substantially smaller installer, a simpler dependency tree, and a hazard-type model that is genuinely extensible (`haz_type` becomes a free-form string rather than a Python subclass hierarchy). It also turns riskwise into the engine's second consumer, which formalises a long-term cross-project compatibility contract that benefits both products forever.

The decision in [DECISIONS.md D05](../DECISIONS.md) — selecting Track A and closing spike #4 — was correct at the time because engine v0.1 covered only river flood. v0.4.0 changes the fact base. Phase 6 is the operationalisation of that change, captured in the new ADR ([adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md)).

Phase 6 is **strictly post-v2.0**. v2.0 ships on Track A as planned in Phase 4. Phase 6 starts after the v2.0.0 tag.

---

## Prerequisites (from Phase 4)

This phase cannot start until:

- [x] **v2.0.0 tagged** on `main` per Phase 4 exit criteria.
- [x] **Phase 4 release-readiness verification complete** (signing/SmartScreen, airplane-mode, beta-channel update, NVDA smoke, reference-hardware benchmarks in `docs/reference/benchmarks.md`).
- [x] **#150 ADR merged** — [adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md) accepted; D26 (renumbered from D18 in the original spec) entered in `docs/DECISIONS.md` superseding D05.
- [x] **Pre-cutover parity smoke recorded** — one-off run of CLIMADA vs engine on the four reference scenarios (§9 of the ADR), results in `docs/spikes/parity-smoke-results.md`. If any row exceeds the §6 tolerances, gate Phase 6 on the upstream engine fix.

If any prerequisite is not met, return to Phase 4 or to #150.

---

## Scope — Areas and their Phase 6 cuts

Full Area specifications live in [ARCHITECTURE.md](../ARCHITECTURE.md). The summaries here are only enough to orient this phase's issues.

| Area | Cut for Phase 6 | Key ARCHITECTURE.md anchor |
|---|---|---|
| **4 — Python Environment: Lean Backend** | Re-baseline the bundle: drop `climada==6.1.0` from runtime deps; add `climate-lama-engine==<cutover-version>`; re-measure Nuitka bundle size and refresh the §4.4 table in [adr-bundling.md](../spikes/adr-bundling.md). | [§ Area 4](../ARCHITECTURE.md#area-4--python-environment-lean-backend-high) |
| **7 — Backend Refactor** | Introduce `backend/engine/adapter.py` as the single seam to `climate-lama-engine`. Swap CLIMADA imports inside `impact/`, `costben/`, `hazard/`, `exposure/`, `entity/` handlers and `base_handler.py` / `run_scenario.py` for the engine via the adapter. Add `backend/engine/loaders/{hdf5,raster,xlsx,gpkg}.py` so file I/O lives outside the engine and outside the handlers. Surgical only — handler shapes preserved (locked decision #3). | [§ Area 7](../ARCHITECTURE.md#area-7--backend-refactor-high) |
| **9 — Testing Strategy** | New parity test suite (`tests/parity/`) compares CLIMADA vs engine on reference scenarios. Existing snapshot tests regenerate at cutover behind the parity gates. v1 CLIMADA-only handler tests deleted post-cutover. | [§ Area 9](../ARCHITECTURE.md#area-9--testing-strategy-high) |
| **18 — Security Hardening** | SBOM regenerates without CLIMADA; NOTICES.txt regenerates against the new dependency tree; `pip-audit` clean. | [§ Area 18](../ARCHITECTURE.md#area-18--security-hardening-high) |
| **20 — Scientific Reproducibility** | Provenance schema migrates `climada_version` → `engine_version`. DuckDB scenario-store schema accepts both fields (nullable). The reproducibility note in `backend/provenance.py` updates accordingly. | [§ Area 20](../ARCHITECTURE.md#area-20--scientific-reproducibility-medium-high) |
| **22 — Extensibility: Custom Hazards, Measures & Impact Functions** | Country-pack format unchanged; loader changes are transparent to user-uploaded ZIPs. New hazard types become JSON + loader contributions, not Python class additions. Documented in the Phase 6 ADR's §10 roadmap appendix. | [§ Area 22](../ARCHITECTURE.md#area-22--extensibility-custom-hazards-measures--impact-functions-medium) |

---

## Issues

The phase is split into a gate + five tracks. Issue numbers (`#X`) are placeholders; GitHub issue numbers are assigned at creation time. Tracks 1–5 do **not** start until the gate (#150) merges.

| Track | # | Title | Depends on |
|---|---|---|---|
| Gate | #150 | ADR: reopen D05 to adopt `climate-lama-engine` | — |
| 1 — Foundation | #151 | Add engine dependency, scaffold `backend/engine/adapter.py` | #150 |
| 1 — Foundation | #152 | Domain dataclasses (`EntityBundle`, `MeasureSpec`) | #151 |
| 2 — Loaders | #153 | HDF5 hazard loader | #151 |
| 2 — Loaders | #154 | GeoTIFF (raster) hazard loader | #151 |
| 2 — Loaders | #155 | XLSX entity / exposure loader | #152 |
| 3 — Compute swap | #156 | `impact/registry.py` → engine `ImpactFunc` / `ImpactFuncSet` | #151 |
| 3 — Compute swap | #157 | `impact/impact_handler.py` → engine `ImpactCalc` | #156, #T2.x |
| 3 — Compute swap | #158 | `costben/costben_handler.py` → `cc.calc_cost_benefit` | #157 |
| 3 — Compute swap | #159 | `hazard/hazard_handler.py` → emit engine `Hazard` | #153, #154 |
| 3 — Compute swap | #160 | `exposure/exposure_handler.py` → emit engine `Exposures` | #155 |
| 3 — Compute swap | #161 | `entity/entity_handler.py` → emit `EntityBundle` | #152, #160 |
| 3 — Compute swap | #162 | `base_handler.py` + `run_scenario.py` cleanups + provenance schema | #161 |
| 4 — Validation | #163 | Parity test suite (`tests/parity/`) | #T3.x complete |
| 4 — Validation | #164 | Flip default backend env var to engine | #163 |
| 4 — Validation | #165 | Bundle benchmark refresh | #164 |
| 5 — Removal & docs | #166 | Remove `climada==6.1.0` from runtime deps | #165 |
| 5 — Removal & docs | #167 | Delete v1 CLIMADA-only handler tests | #166 |
| 5 — Removal & docs | #168 | Docs final pass (DECISIONS, ARCHITECTURE, phase exit criteria) | #166 |
| 5 — Removal & docs | #169 | (Conditional) upstream engine PRs for any gaps surfaced | open across the phase |

`#T2.3` (MAT loader) is intentionally not on the list — locked decision in the ADR.

---

## Suggested sequencing

1. **#150** alone, before anything else. ADR + DECISIONS + parity smoke results.
2. **#151** unlocks Tracks 2 and 3.
3. **Track 2** runs in parallel with the early parts of Track 3 (registry swap doesn't need loaders).
4. **Track 3** lands handler-by-handler behind the per-handler env-var flag. Each PR includes a smoke test against the corresponding parity-suite scenario.
5. **#163** lands once all of Track 3 is merged with the env var still defaulting to `climada` — gives a clean side-by-side comparison surface.
6. **#164** flips the default once the parity suite has been green in CI for at least one merge cycle.
7. **#165** captures the new bundle numbers.
8. **Track 5** cleans up. #166 is the point of no return — only run it after #164 has soaked.

---

## Exit criteria

Phase 6 is complete when all of the following are true:

- [x] `python -c "import climada"` raises `ModuleNotFoundError` in a clean install (`climada` is fully removed from runtime deps in `pyproject.toml`, `requirements/requirements.txt`, `requirements/environment.yml`).
- [x] `pip install -e .` and `pip install -r requirements/requirements.txt` complete without `climada` in the resolution.
- [x] `pytest tests/unit tests/integration tests/parity -q` is green.
- [x] Parity test suite (`tests/parity/`) is in CI; passes on EGY-flood, EGY-drought, THA-flood, and one custom-data ZIP within the §6 ADR gates (±2 % AAL, ±5 % RP-50/100/250, ±5 % BCR).
- [x] Egypt-flood ERA scenario runs end-to-end through the Electron UI; result blob carries `engine: "climate-lama-engine"`, `engine_version: "<pinned>"`, `climada_version: null`.
- [x] Custom-data scenario (user-uploaded ZIP) runs end-to-end. Loaders accept the same ZIP schema as before #150.
- [x] Nuitka bundle size measured and recorded in `docs/reference/benchmarks.md` v2.x section. ≤ 250 MB target met (or escalated per ADR §7).
- [x] No file under `backend/` (except `backend/engine/adapter.py`) imports `climate_lama_engine.*` directly. (Enforced by `scripts/check_engine_imports.py` in CI.)
- [x] `pip-audit` clean against the new dependency tree.
- [x] SBOM regenerated; NOTICES.txt regenerated; both committed.
- [x] `docs/DECISIONS.md` updated with D26 superseding D05; `docs/ARCHITECTURE.md` Areas 4, 7, 18, 20 references CLIMADA replaced with engine references where behaviour changed (Areas 6 and 11 had no CLIMADA-specific text to update); this file's exit criteria all checked.
- [x] In the engine repo: `.github/PULL_REQUEST_TEMPLATE.md` updated per ADR §5.3; backbone-compat test and riskwise-compat test both in place; engine pinned to the cutover version on PyPI with release notes.

---

## Where to start from cold

1. Confirm v2.0.0 has tagged on `main`. If not, return to [phase-4-distribution-and-polish.md](phase-4-distribution-and-polish.md).
2. Read the ADR ([adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md)) end-to-end. It is the source of truth for *why* and *what*; this file is *how* and *when*.
3. Read [DECISIONS.md D18](../DECISIONS.md) once it exists. Confirm it supersedes D05.
4. Read the climate-lama backbone adapter at `../climate-lama/src/climate_lama/worker/models/engine_adapter.py`. The riskwise-side adapter mirrors its array-in / array-out contract; you will reference this file frequently.
5. Open #150 and follow its acceptance criteria. Do not start any Track 1 issue until #150 has merged.

---

## Issue specifications (full bodies — paste these into GitHub issues at creation time)

Each spec below is written to be self-contained. The `/build` skill consumes a single GitHub issue at a time and needs (a) clear context, (b) testable acceptance criteria, (c) precise file paths, (d) explicit scope boundaries, (e) a verification recipe. Each spec follows that template.

---

### #150 — ADR: reopen D05 to adopt `climate-lama-engine`

**Track**: Gate
**Depends on**: — (gates everything else)
**Labels**: `phase-6`, `area-4`, `area-22`, `documentation`

**Context**

[DECISIONS.md D05](../DECISIONS.md) selected Track A (CLIMADA + Nuitka) for v2.0 and closed spike #4 (`climate_lama_engine`) as won't-do because the engine at the time covered river flood only. Engine v0.4.0 (released 2026-04-20) now covers the full risk-assessment surface and is in production use inside the climate-lama backbone. This issue ships the ADR that reopens D05, captures the new fact base, and formalises the cross-project compatibility contract that governs all three repos (`riskwise-v2`, `climate-lama-engine`, `climate-lama`) from now on.

**Acceptance criteria**

- [ ] `docs/spikes/adr-climate-lama-engine-adoption.md` exists and contains all 13 sections from the agreed structure (scope; CLIMADA usage map; capability assessment; the decision; the cross-project compatibility contract; parity gates; bundle reality; provenance migration; outstanding parity smoke; engine roadmap appendix; rollback plan; new D-number; references).
- [ ] `docs/DECISIONS.md` carries a new entry (D18 unless renumbered) explicitly superseding D05, with the supersedes link in both directions.
- [ ] `docs/spikes/adr-bundling.md` §6 has a note appended pointing to this ADR's §7 as the re-baselined bundle target.
- [ ] `docs/plan/README.md` phase index lists Phase 6 (this work) and renumbers the existing "Phase 5 — Optional / Later" to Phase 7. The cross-phase dependencies section's note about spike #4 is updated to reference the reopening ADR rather than the won't-do closure.
- [ ] `docs/plan/phase-5-optional.md` is renamed to `docs/plan/phase-7-optional.md` (keep `git mv` for history) and its header updated from "Phase 5" to "Phase 7".
- [ ] `docs/plan/phase-6-engine-migration.md` exists and lists every issue spec from this file's Issue specifications section.
- [ ] **Parity smoke recorded**: `docs/spikes/parity-smoke-results.md` exists and contains numbers for the four reference scenarios from the ADR §6, run side-by-side through CLIMADA and a hand-rolled engine adapter. Every row meets the §6 tolerances OR the gap is documented and an upstream engine issue is filed and linked.
- [ ] **In the engine repo**: `.github/PULL_REQUEST_TEMPLATE.md` updated per ADR §5.3 — every PR must list affected public API entries, include backbone-compat and riskwise-compat tests, name the consumer driving the change.

**Key files**

- Create: `docs/spikes/adr-climate-lama-engine-adoption.md`
- Create: `docs/plan/phase-6-engine-migration.md`
- Create: `docs/spikes/parity-smoke-results.md`
- Modify: `docs/DECISIONS.md` (new D18; D05 marked superseded)
- Modify: `docs/spikes/adr-bundling.md` (§6 footnote)
- Modify: `docs/plan/README.md` (insert Phase 6; renumber 5→7; update cross-phase note)
- Rename: `docs/plan/phase-5-optional.md` → `docs/plan/phase-7-optional.md` (and update header)
- Cross-repo: `<engine-repo>/.github/PULL_REQUEST_TEMPLATE.md`

**Scope boundaries (NOT in this issue)**

- No code changes to `backend/`. No engine dependency added. No CLIMADA dependency removed.
- No actual Phase 6 implementation work; this issue exists purely to ratify direction and unlock Tracks 1–5.

**Verification**

- Read the ADR end to end; every section is non-empty and numbered.
- `git log --oneline -- docs/spikes/adr-climate-lama-engine-adoption.md` shows the merge.
- `cat docs/spikes/parity-smoke-results.md` shows numerical tables for all four scenarios.
- The engine repo PR template renders correctly on a draft PR.

---

### #151 — Add `climate-lama-engine` dependency, scaffold `backend/engine/adapter.py`

**Track**: 1 — Foundation
**Depends on**: #150
**Labels**: `phase-6`, `area-4`, `area-7`, `backend`

**Context**

Adds `climate-lama-engine` as a runtime dependency alongside `climada==6.1.0` (parallel install — CLIMADA stays for the duration of Tracks 1–4 to support side-by-side parity testing) and creates the riskwise-side adapter module. The adapter mirrors the climate-lama backbone's `engine_adapter.py` contract: arrays in, engine objects out, then engine objects in, riskwise-domain results out. This is the **only** module in `backend/` allowed to `import climate_lama_engine.*`; every other module routes through the adapter.

**Acceptance criteria**

- [ ] `pyproject.toml` adds `climate-lama-engine==<cutover-version>` to `[project.dependencies]`. `climada==6.1.0` is unchanged. Version is hard-pinned per ADR §5.1 rule 5.
- [ ] `requirements/requirements.txt` and `requirements/environment.yml` mirror the addition with the same hard pin.
- [ ] `backend/engine/__init__.py` exists and re-exports the adapter's public API (no other symbols).
- [ ] `backend/engine/adapter.py` exists with the following public functions, each with type-annotated signatures and docstrings:
  - `build_hazard(arrays: HazardArrays) -> cc.Hazard`
  - `build_exposures(arrays: ExposureArrays) -> cc.Exposures`
  - `build_impfset(specs: list[ImpactFunctionSpec]) -> cc.ImpactFuncSet`
  - `build_measure(spec: MeasureSpec) -> cc.Measure`
  - `run_impact(hazard, exposures, impfset, *, save_mat: bool = False) -> cc.Impact`
  - `run_cost_benefit(hazard_present, hazard_future, exposures, impfset, measures, discount_rate, present_year, future_year) -> list[cc.CostBenefitResult]`
- [ ] Environment variable `RISKWISE_ENGINE_BACKEND` documented in `backend/engine/__init__.py` docstring; default value `"climada"` (preserves current behaviour); valid values `"climada" | "engine"`. Per-handler call sites consult this flag in later issues (Track 3).
- [ ] An `EngineUnavailableError` exception is raised if `climate_lama_engine` cannot be imported, with the install hint `pip install climate-lama-engine==<pin>`.
- [ ] CI lint rule enforces "no `climate_lama_engine` import outside `backend/engine/`" — implementation can be a Ruff custom rule, an `import-linter` config, or a pre-commit grep with a clear failure message. Whichever is chosen, the rule is documented in `CONTRIBUTING.md`.
- [ ] Smoke test `tests/unit/engine/test_adapter_smoke.py`:
  - Builds a `cc.Hazard` from a synthetic 3-event/2-centroid CSR matrix.
  - Builds a `cc.Exposures` from a synthetic 5-asset array.
  - Runs `run_impact` and asserts `impact.aai_agg > 0` and `impact.at_event.shape[0] == 3`.

**Key files**

- Create: `backend/engine/__init__.py`
- Create: `backend/engine/adapter.py`
- Create: `tests/unit/engine/test_adapter_smoke.py`
- Modify: `pyproject.toml`
- Modify: `requirements/requirements.txt`
- Modify: `requirements/environment.yml`
- Modify: `CONTRIBUTING.md` (new lint rule note)

**Scope boundaries (NOT in this issue)**

- No domain dataclasses (`EntityBundle`, `MeasureSpec`, `ImpactFunctionSpec`) — those land in #152. The adapter signatures here use bare types or forward references that #152 fills in.
- No loader work — that is Track 2.
- No handler call-site changes — those are Track 3. The env var is wired up but not consulted yet.

**Verification**

- `pip install -e .` in a clean venv succeeds.
- `python -c "from backend.engine.adapter import run_impact"` succeeds.
- `python -c "import climate_lama_engine; print(climate_lama_engine.__version__)"` prints the pinned version.
- `pytest tests/unit/engine -q` is green.
- The CI lint rule fails when a deliberate test PR adds `import climate_lama_engine` to `backend/impact/impact_handler.py`.

---

### #152 — Domain dataclasses (`EntityBundle`, `MeasureSpec`, `ImpactFunctionSpec` consolidation)

**Track**: 1 — Foundation
**Depends on**: #151
**Labels**: `phase-6`, `area-7`, `backend`

**Context**

The engine has no aggregator equivalent to CLIMADA's `Entity` (which packs `Exposures` + `ImpactFuncSet` + `DiscRates` + `MeasureSet`). It also has no `MeasureSet` registry. Riskwise needs lightweight dataclasses that play the aggregator role on the riskwise side without coupling handler code to engine types. This issue introduces those dataclasses, plus reuses the existing `ImpactFunctionSpec` from `backend/impact/registry.py` (or moves it into `backend/engine/types.py` if that produces a cleaner import graph).

**Acceptance criteria**

- [ ] `backend/engine/types.py` exists with the following dataclasses, all `@dataclass(frozen=True)`:
  - `HazardArrays` — wraps the dict-shaped contract from the backbone adapter (`intensity: csr_matrix`, `frequency`, `centroid_lat`, `centroid_lon`, `haz_type`, `intensity_unit`, `frequency_type`, `event_names`).
  - `ExposureArrays` — `values`, `centroid_idx`, `impf_id`, `lat`, `lon`, `deductible`, `cover`, `value_unit`.
  - `MeasureSpec` — domain measure (mirrors `Measure` ORM fields used by the backbone adapter).
  - `EntityBundle` — `exposures: ExposureArrays`, `impfset_specs: list[ImpactFunctionSpec]`, `measures: list[MeasureSpec]`, `discount_rate: float`, `ref_year: int`.
- [ ] `ImpactFunctionSpec` either continues to live in `backend/impact/registry.py` and is re-exported from `backend/engine/types.py`, OR is moved to `backend/engine/types.py` and re-exported from the registry module — pick whichever produces zero circular imports. Document the choice in the module docstring.
- [ ] Adapter signatures from #151 updated to use the real dataclasses (replace forward references / bare types).
- [ ] Tests `tests/unit/engine/test_types.py`:
  - Each dataclass round-trips `pickle.dumps`/`pickle.loads` byte-equal.
  - Two `EntityBundle` instances with identical content compare equal.
  - Mutating a frozen field raises `FrozenInstanceError`.

**Key files**

- Create: `backend/engine/types.py`
- Create: `tests/unit/engine/test_types.py`
- Modify: `backend/engine/adapter.py` (signatures use the real types)
- Modify (potentially): `backend/impact/registry.py` (re-export if `ImpactFunctionSpec` moves)

**Scope boundaries (NOT in this issue)**

- No call-site changes in handlers — Track 3 wires these dataclasses into the handler logic.
- No JSON / file (de)serialization helpers; loaders (Track 2) and handlers (Track 3) construct dataclasses directly from their own inputs.

**Verification**

- `python -c "from backend.engine.types import EntityBundle, MeasureSpec, HazardArrays, ExposureArrays"` succeeds.
- `pytest tests/unit/engine/test_types.py -q` is green.
- `python -c "from backend.engine.adapter import run_impact; import inspect; print(inspect.signature(run_impact))"` shows the new types in the signature.

---

### #153 — HDF5 hazard loader

**Track**: 2 — Loaders
**Depends on**: #151
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

CLIMADA today reads `data/hazards/*.h5` (drought, heatwave) via `Hazard.from_hdf5`. The engine has no file I/O. This issue ports the read path into riskwise. The output is a `HazardArrays` instance suitable for `backend/engine/adapter.py:build_hazard`. Behaviour must match CLIMADA's loader byte-for-byte on the reference fixtures, both in terms of intensity matrix entries and in terms of frequency semantics (occurrence vs marginal).

**Acceptance criteria**

- [ ] `backend/engine/loaders/__init__.py` exists.
- [ ] `backend/engine/loaders/hdf5.py` exists with `load_hazard_h5(path: Path) -> HazardArrays` and `h5py` is a direct dependency (added to `pyproject.toml` if not already).
- [ ] The loader reads:
  - Intensity matrix (CSR sparse).
  - Frequency array, with `frequency_type` derived from the file's metadata (CLIMADA stores this either as an attribute or implicitly via the file shape — replicate whatever the existing CLIMADA path produces).
  - Centroid lat/lon arrays.
  - `haz_type`, `intensity_unit`, `event_names` from file metadata (with documented defaults if a field is missing).
- [ ] Edge cases handled with explicit errors (`HazardLoadError` subclass of `ValueError`):
  - File missing → clear "file not found" message with the path.
  - Required dataset missing inside the H5 → message names the dataset.
  - Shape mismatch (intensity vs frequency vs centroid) → message names the shapes.
- [ ] Test fixtures under `tests/fixtures/hazards/`:
  - `egy_drought_present.h5` (a small sliced version of the production drought file; ≤ 1 MB if possible).
  - `egy_heatwave_present.h5` (same approach).
- [ ] Tests `tests/unit/engine/loaders/test_hdf5.py`:
  - For each fixture, load via the new path *and* via CLIMADA's `Hazard.from_hdf5`. Assert intensity matrices are byte-equal, frequencies are float-equal within `1e-12`, centroid arrays are float-equal within `1e-12`, `haz_type` and `intensity_unit` strings are exactly equal.
  - Each error-path edge case (missing file, missing dataset, shape mismatch) raises `HazardLoadError` with the expected substring in the message.

**Key files**

- Create: `backend/engine/loaders/__init__.py`
- Create: `backend/engine/loaders/hdf5.py`
- Create: `backend/engine/loaders/_errors.py` (or inline in `__init__.py`)
- Create: `tests/unit/engine/loaders/test_hdf5.py`
- Create: `tests/fixtures/hazards/egy_drought_present.h5`
- Create: `tests/fixtures/hazards/egy_heatwave_present.h5`
- Modify: `pyproject.toml` (add `h5py` if not already direct)

**Scope boundaries (NOT in this issue)**

- No raster (GeoTIFF) loading — that is #154.
- No XLSX entity loading — that is #155.
- No handler call-site changes — Track 3.
- No removal of CLIMADA's HDF5 path; the existing handlers still go through CLIMADA. This issue lays the new path alongside.

**Verification**

- `pytest tests/unit/engine/loaders/test_hdf5.py -q` is green.
- `python -c "from backend.engine.loaders.hdf5 import load_hazard_h5; print(load_hazard_h5('tests/fixtures/hazards/egy_drought_present.h5'))"` prints a `HazardArrays` with non-empty fields.

---

### #154 — GeoTIFF (raster) hazard loader

**Track**: 2 — Loaders
**Depends on**: #151
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

Flood hazards live in `data/hazards/*.tif` and were read via CLIMADA's `Hazard.from_raster`. CLIMADA's reader handles RP-band rasters (one band per return period) and attaches marginal frequencies via `from_rp_maps` semantics. This issue ports both flat-event and RP-band cases. The output is a `HazardArrays` with `frequency_type` set to either `"occurrence"` or `"marginal"` as appropriate.

**Acceptance criteria**

- [ ] `backend/engine/loaders/raster.py` exists with `load_hazard_raster(path: Path, *, return_periods: list[int] | None = None) -> HazardArrays`.
  - If `return_periods` is `None`: each raster band is one event; frequencies derived from band metadata if present, else equal weights.
  - If `return_periods` is provided: bands map to RPs in order; frequencies are computed via the engine's own `Hazard.from_rp_maps` math (do not reimplement — call into the engine for the RP→marginal conversion and then unwrap the resulting `Hazard`'s `frequency` and `intensity` for the `HazardArrays`).
- [ ] CRS handling: assume WGS84 input; if the raster declares a different CRS, reproject centroid coordinates to WGS84 via `pyproj.Transformer`. Document this assumption in the module docstring.
- [ ] `rasterio` is a direct dependency in `pyproject.toml` (was transitive via CLIMADA; now direct).
- [ ] Test fixtures: `tests/fixtures/hazards/egy_flood_present_rp.tif`, `egy_flood_future_rp.tif`. Small, RP-banded, WGS84.
- [ ] Tests `tests/unit/engine/loaders/test_raster.py`:
  - RP-band fixture: load via new path *and* via CLIMADA's existing raster loader. Assert intensity matrix is byte-equal, frequencies are float-equal within `1e-9` (allow for `from_rp_maps` floating-point delta), centroid arrays are float-equal within `1e-9`.
  - Flat-event fixture (single-band): same parity check.
  - CRS edge case: a fixture in EPSG:3857; loaded path produces lat/lon coordinates within `1e-6` of the WGS84 reference.
  - File-not-found and bad-band-count cases raise `HazardLoadError` with the expected substring.

**Key files**

- Create: `backend/engine/loaders/raster.py`
- Create: `tests/unit/engine/loaders/test_raster.py`
- Create: 3 small TIF fixtures under `tests/fixtures/hazards/`
- Modify: `pyproject.toml` (promote `rasterio` to direct dep)

**Scope boundaries (NOT in this issue)**

- No NetCDF / xarray ingest — that's a Phase 7+ engine roadmap item.
- No vector (shapefile / GeoJSON) hazard ingest — riskwise has no such files today.
- No handler call-site changes — Track 3.

**Verification**

- `pytest tests/unit/engine/loaders/test_raster.py -q` is green.
- `python -c "from backend.engine.loaders.raster import load_hazard_raster; arr = load_hazard_raster('tests/fixtures/hazards/egy_flood_present_rp.tif', return_periods=[10,50,100,250]); print(arr.frequency_type, arr.frequency)"` prints `marginal` and a 4-element array.

---

### #155 — XLSX entity / exposure loader

**Track**: 2 — Loaders
**Depends on**: #152
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

CLIMADA reads XLSX entity files via `Entity.from_excel`, which produces a packed `Entity` containing `Exposures`, `ImpactFuncSet`, `DiscRates`, and `MeasureSet`. Riskwise's data layout (per-country `*.xlsx` under `data/entities/` and inside user ZIPs) follows the same workbook structure. This issue ports the read path and produces an `EntityBundle` (the Phase 6 replacement for CLIMADA's `Entity` aggregator).

**Acceptance criteria**

- [ ] `backend/engine/loaders/xlsx.py` exists with `load_entity_xlsx(path: Path) -> EntityBundle`.
- [ ] Workbook sheets parsed:
  - `assets` → `ExposureArrays` (value, centroid_idx, impf_id, lat, lon, deductible, cover, value_unit).
  - `impact_functions` → `list[ImpactFunctionSpec]` (intensity / mdd / paa arrays per (haz_type, exp_type, id) row).
  - `measures` → `list[MeasureSpec]`.
  - `discount` → scalar `discount_rate` (the average / last-year rate; document the choice).
  - `meta` (or first sheet) → `ref_year`.
- [ ] Validation at load time (re-uses `ImpactFunctionRegistry`'s monotonicity / unit / id-uniqueness checks where applicable; raises `EntityLoadError` subclass of `ValueError` on any violation, naming the offending row).
- [ ] Test fixtures: `tests/fixtures/entities/egy_economic_present.xlsx`, `tha_economic_present.xlsx`. Small (≤ 50 assets) versions of production files.
- [ ] Tests `tests/unit/engine/loaders/test_xlsx.py`:
  - For each fixture, load via new path *and* via CLIMADA's `Entity.from_excel`. Assert `Exposures.value`, `centroid_idx`, `impf_id`, `lat`, `lon` are float-equal within `1e-9`. Assert each `ImpactFunctionSpec`'s intensity/mdd/paa arrays match the corresponding `ImpactFunc` instance from the CLIMADA path within `1e-12`. Assert measures parse to identical (name, cost, freq_cutoff, …) tuples.
  - Validation-failure paths (non-monotonic curve, duplicate impf id, missing sheet) raise `EntityLoadError`.

**Key files**

- Create: `backend/engine/loaders/xlsx.py`
- Create: `tests/unit/engine/loaders/test_xlsx.py`
- Create: 2 fixtures under `tests/fixtures/entities/`
- Modify: `pyproject.toml` (no change expected; `openpyxl` already a direct dep)

**Scope boundaries (NOT in this issue)**

- No CSV / parquet entity loaders — outside scope.
- No GeoPackage exposure loaders — that lives in `exposure_handler.py` and stays through #160.
- No handler call-site changes — Track 3.

**Verification**

- `pytest tests/unit/engine/loaders/test_xlsx.py -q` is green.
- `python -c "from backend.engine.loaders.xlsx import load_entity_xlsx; b = load_entity_xlsx('tests/fixtures/entities/egy_economic_present.xlsx'); print(len(b.impfset_specs), b.discount_rate)"` prints sensible numbers.

---

### #156 — `impact/registry.py` → engine `ImpactFunc` / `ImpactFuncSet`

**Track**: 3 — Compute swap
**Depends on**: #151
**Labels**: `phase-6`, `area-7`, `backend`

**Context**

`backend/impact/registry.py` validates and caches impact functions per country. Today it instantiates `climada.entity.impact_funcs.ImpactFunc` and `ImpactFuncSet`. This issue swaps those imports for the engine equivalents through `backend/engine/adapter.py:build_impfset`. The registry's external API (`get(exp_type, haz_type)`, `as_impfset()`, error messages) stays unchanged. This is the smallest-blast-radius compute-swap and a natural starting point for Track 3.

**Acceptance criteria**

- [ ] `backend/impact/registry.py` no longer imports from `climada.entity.impact_funcs`. The `_build_impfunc` (or equivalent) helper is replaced by a call to `backend.engine.adapter.build_impfset` (constructing one or many specs at a time as the registry already does).
- [ ] The registry's public API is unchanged: same class names, same method signatures, same error class (`ImpactFunctionRegistryError`), same error messages.
- [ ] Existing tests under `tests/unit/impact/` (`test_registry_load_happy_path.py`, `test_registry_duplicate_id_violation.py`, `test_registry_monotonicity_violation.py`, `test_registry_unit_mismatch_violation.py`) all pass without change.
- [ ] New test `tests/unit/impact/test_registry_engine_backend.py` asserts:
  - `registry.get("flooded_buildings", "FL")` returns an instance whose `__module__` starts with `climate_lama_engine` (not `climada`).
  - The returned object's `intensity`, `mdd`, `paa` arrays equal the registry's input spec within `1e-12`.

**Key files**

- Modify: `backend/impact/registry.py`
- Create: `tests/unit/impact/test_registry_engine_backend.py`

**Scope boundaries (NOT in this issue)**

- The env-var feature flag is not consulted here; the registry always returns engine objects post-#156. (This is the one handler swap that does not need a feature flag — the registry's output is consumed only by the impact handler, which still has its own flag.)
- No changes to JSON country-pack format. The on-disk schema is identical.

**Verification**

- `pytest tests/unit/impact -q` is green.
- `python -c "from backend.impact.registry import ImpactFunctionRegistry; from pathlib import Path; r = ImpactFunctionRegistry.from_country(Path('countries/EGY')); print(type(r.get('flooded_buildings', 'FL')))"` shows a `climate_lama_engine.ImpactFunc`.

---

### #157 — `impact/impact_handler.py` → engine `ImpactCalc`

**Track**: 3 — Compute swap
**Depends on**: #156, #153, #154
**Labels**: `phase-6`, `area-7`, `backend`

**Context**

`backend/impact/impact_handler.py` is the impact-calculation entry point. It currently constructs CLIMADA `Hazard`, `Exposures`, `ImpactCalc`, and `Impact` objects directly. This issue routes the calculation through `backend.engine.adapter.run_impact`, gated on the `RISKWISE_ENGINE_BACKEND` env var. The CLIMADA path stays in-tree and is the default until #164 flips it.

**Acceptance criteria**

- [ ] `impact_handler.py` introduces a backend-selector helper:
  ```python
  if os.environ.get("RISKWISE_ENGINE_BACKEND", "climada") == "engine":
      return _calculate_via_engine(...)
  return _calculate_via_climada(...)
  ```
  Both branches accept and return the same domain objects (`HazardArrays`, `EntityBundle`, an `ImpactResult` named tuple or dataclass — whichever is least-invasive given current handler shape).
- [ ] `_calculate_via_engine` constructs `cc.Hazard` / `cc.Exposures` / `cc.ImpactFuncSet` via `backend.engine.adapter`, calls `run_impact`, and returns the result in the same shape `_calculate_via_climada` returns.
- [ ] `_calculate_via_climada` is the existing logic, isolated into its own private function. No behaviour change for the CLIMADA path.
- [ ] The handler still imports `climada.*` (legitimately — for the CLIMADA branch). The lint rule from #151 exempts only the existing CLIMADA imports here, not new ones.
- [ ] Tests `tests/unit/impact/test_impact_handler_dual_backend.py`:
  - With `RISKWISE_ENGINE_BACKEND=climada`, `calculate_impact(...)` produces a result whose `aai_agg` matches the existing snapshot in `tests/unit/impact/test_impact_aal_snapshot.py` exactly.
  - With `RISKWISE_ENGINE_BACKEND=engine`, the result's `aai_agg` is within ±2 % of the CLIMADA snapshot.
  - Both branches produce identical `n_valid_points` and `n_excluded_points` integers.

**Key files**

- Modify: `backend/impact/impact_handler.py`
- Create: `tests/unit/impact/test_impact_handler_dual_backend.py`

**Scope boundaries (NOT in this issue)**

- Cost-benefit handler is #158.
- The hazard / exposure / entity handlers are still emitting CLIMADA objects at this point. The impact handler converts inbound CLIMADA `Hazard` / `Exposures` to engine arrays internally. Once Track 3 advances, those upstream conversions disappear.
- No removal of `tests/unit/impact/test_impact_aal_snapshot.py`. The snapshot is still authoritative until #164.

**Verification**

- `pytest tests/unit/impact -q` is green with both `RISKWISE_ENGINE_BACKEND=climada` and `RISKWISE_ENGINE_BACKEND=engine`.
- A scratch script that runs the EGY-flood-ERA scenario via the API end to end produces matching `aai_agg` (within ±2 %) under both flags.

---

### #158 — `costben/costben_handler.py` → `cc.calc_cost_benefit`

**Track**: 3 — Compute swap
**Depends on**: #157
**Labels**: `phase-6`, `area-7`, `backend`

**Context**

`backend/costben/costben_handler.py` runs `climada.engine.CostBenefit` over a list of `Measure`s with `DiscRates`. The engine offers `cc.calc_cost_benefit(hazard_present, hazard_future, exposures, impfset, measures, discount_rate, present_year, future_year)` — function, not class — with a scalar discount rate. The backbone adapter at `../climate-lama/src/climate_lama/worker/models/engine_adapter.py:212` is the reference call site; mirror its conversion logic.

**Acceptance criteria**

- [ ] `costben_handler.py` has the same env-var gated dual-backend split as #157.
- [ ] The engine branch builds `Measure` instances via `backend.engine.adapter.build_measure` from the existing `MeasureSpec` list. The mapping mirrors the backbone's `_build_measure` (`hazard_inten_imp` → `haz_inten_a`, `mdd_impact_a/b` → `mdd_a/b`, etc.).
- [ ] `DiscRates` is collapsed to a scalar discount rate. Document in a code comment which year's rate is used (consistent with #155's choice).
- [ ] The result shape returned from the handler is identical between branches: same number of `CostBenefitResult` objects, same field names, same units. If the existing CLIMADA path returns a different shape, normalise to the engine's `CostBenefitResult` schema and update the JSON serializer accordingly.
- [ ] Tests `tests/unit/costben/test_costben_handler_dual_backend.py`:
  - For each measure in the EGY-flood-ERA fixture, `cost`, `benefit`, `bcr` agree within ±5 % between branches.
  - `risk_baseline_present` and `risk_baseline_future` agree within ±2 %.
  - With zero measures, both branches return an empty list without raising.

**Key files**

- Modify: `backend/costben/costben_handler.py`
- Create: `tests/unit/costben/test_costben_handler_dual_backend.py`

**Scope boundaries (NOT in this issue)**

- No new measure attributes — anything extra the engine accepts (e.g., richer `freq_cutoff` semantics) is captured as a future engine roadmap item.
- The frontend's cost-benefit chart format is unchanged — the JSON written to DuckDB carries the same fields. If the engine's `CostBenefitResult` has *more* fields than the chart needs, the handler drops them.

**Verification**

- `pytest tests/unit/costben -q` is green with both env-var values.
- The EGY-flood-ERA scenario's cost-benefit chart looks identical (within tolerance) in the Electron UI under both flags.

---

### #159 — `hazard/hazard_handler.py` → emit engine `Hazard`

**Track**: 3 — Compute swap
**Depends on**: #153, #154
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

The hazard handler reads HDF5 / raster / XLSX hazard files and currently produces a `climada.hazard.Hazard`. With #153 and #154 in place, it can produce `HazardArrays` instead, then convert to `cc.Hazard` via the adapter. This issue swaps the production side of the handler. The handler keeps its public method signatures so callers (the impact and cost-benefit handlers) see no change beyond the type of object returned — and the impact handler's dual-backend branch already handles either shape.

**Acceptance criteria**

- [ ] Env-var gated dual-backend split, same shape as #157.
- [ ] Engine branch routes through `backend.engine.loaders.{hdf5,raster}` then `backend.engine.adapter.build_hazard`.
- [ ] CLIMADA branch is unchanged.
- [ ] When `RISKWISE_ENGINE_BACKEND=engine`, the handler returns a `cc.Hazard` (typed) and downstream consumers (impact handler, cost-benefit handler) accept it.
- [ ] When `RISKWISE_ENGINE_BACKEND=climada`, the handler returns a `climada.hazard.Hazard` exactly as before.
- [ ] Tests `tests/unit/hazard/test_hazard_handler_engine.py`:
  - With env=`engine`: `get_hazard("FL", path_to_egy_flood_tif)` returns a `cc.Hazard` whose `n_events`, `intensity.shape`, `frequency.shape` match the CLIMADA path's equivalent within `1e-9`.
  - With env=`climada`: legacy behaviour preserved (existing tests pass).

**Key files**

- Modify: `backend/hazard/hazard_handler.py`
- Create: `tests/unit/hazard/test_hazard_handler_engine.py`

**Scope boundaries (NOT in this issue)**

- No removal of CLIMADA-specific subclasses (`Hazard.from_hdf5`, `from_raster`) from the call path — the env var still routes through them when `climada` is selected.
- No changes to file formats on disk.

**Verification**

- `pytest tests/unit/hazard -q` is green with both env-var values.
- A scratch script: `RISKWISE_ENGINE_BACKEND=engine python -c "from backend.hazard.hazard_handler import HazardHandler; h = HazardHandler().get_hazard('FL', 'data/hazards/egy_flood_present.tif'); print(type(h), h.n_events)"` prints a `cc.Hazard` and a non-zero event count.

---

### #160 — `exposure/exposure_handler.py` → emit engine `Exposures`

**Track**: 3 — Compute swap
**Depends on**: #155
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

Same shape as #159 but for exposures. The handler still uses `geopandas` for `generate_exposure_geojson()` (output for the map UI) — that part stays untouched. Only the production of `Exposures` for the compute path swaps.

**Acceptance criteria**

- [ ] Env-var gated dual-backend split.
- [ ] Engine branch routes through `backend.engine.loaders.xlsx` (for XLSX entity files) and a new helper `backend.engine.loaders.gpkg.load_exposures_gpkg(path: Path) -> ExposureArrays` (for GeoPackage exposures), then `backend.engine.adapter.build_exposures`.
- [ ] `generate_exposure_geojson` is unchanged. It continues to use geopandas.
- [ ] `get_growth_exposure(exposure, annual_growth, future_year)` works identically on both branches: the multiplier `(1 + annual_growth) ** (future_year - ref_year)` applied to the value array. For the engine branch, this returns a new `cc.Exposures` (or `ExposureArrays`) with multiplied values.
- [ ] Tests `tests/unit/exposure/test_exposure_handler_engine.py`:
  - Under env=`engine`, the loaded exposures match the CLIMADA path's value/lat/lon arrays within `1e-9`.
  - `get_growth_exposure` produces multiplied values within `1e-12` on both branches.

**Key files**

- Modify: `backend/exposure/exposure_handler.py`
- Create: `backend/engine/loaders/gpkg.py`
- Create: `tests/unit/exposure/test_exposure_handler_engine.py`

**Scope boundaries (NOT in this issue)**

- No removal of `geopandas` — keeps its role in GeoJSON output.
- No changes to the GeoPackage schema.

**Verification**

- `pytest tests/unit/exposure -q` is green with both env-var values.

---

### #161 — `entity/entity_handler.py` → emit `EntityBundle`

**Track**: 3 — Compute swap
**Depends on**: #152, #160
**Labels**: `phase-6`, `area-7`, `area-22`, `backend`

**Context**

The entity handler today produces a `climada.entity.Entity` packing exposures, impact functions, discount rates, and measures. Under the engine path it produces an `EntityBundle` (the dataclass from #152). This is the handler that touches the most call sites — every downstream consumer (impact, cost-benefit, run_scenario) must accept either shape based on the env var.

This is also the issue that **builds the local catalog** that replaces `climada.util.api_client.Client` (locked decision #4 from the ADR).

**Acceptance criteria**

- [ ] Env-var gated dual-backend split.
- [ ] `data/catalog.json` exists and lists every dataset shipped with riskwise (per-country hazard files, entity files, measures). Schema documented in `backend/engine/catalog.py`.
- [ ] `backend/engine/catalog.py` exposes `is_dataset_available(country: str, hazard: str) -> bool` and replaces the remaining `Client`-based call paths.
- [ ] Engine branch builds an `EntityBundle` from `backend.engine.loaders.xlsx.load_entity_xlsx` plus the registry (#156).
- [ ] CLIMADA branch unchanged.
- [ ] Tests `tests/unit/entity/test_entity_handler_engine.py`:
  - Under env=`engine`, `EntityBundle.exposures` matches the CLIMADA path's `Entity.exposures` value arrays within `1e-9`.
  - `EntityBundle.impfset_specs` matches the CLIMADA path's `Entity.impact_funcs` curve arrays within `1e-12`.
  - `EntityBundle.discount_rate` is a scalar matching the documented year choice.
- [ ] Tests `tests/unit/engine/test_catalog.py`:
  - `is_dataset_available("EGY", "FL")` returns `True` for shipped datasets, `False` for unshipped.
  - The catalog's JSON schema validates against a schema file in `tests/fixtures/catalog_schema.json`.

**Key files**

- Modify: `backend/entity/entity_handler.py`
- Create: `data/catalog.json`
- Create: `backend/engine/catalog.py`
- Create: `tests/unit/entity/test_entity_handler_engine.py`
- Create: `tests/unit/engine/test_catalog.py`
- Create: `tests/fixtures/catalog_schema.json`

**Scope boundaries (NOT in this issue)**

- The catalog does not yet replace **all** `Client` calls — `base_handler.py`'s remaining `Client` usage is closed in #162.
- No UI changes for dataset-availability indicators (the JSON shape from `is_dataset_available` matches the previous `Client`-derived response).

**Verification**

- `pytest tests/unit/entity tests/unit/engine -q` is green with both env-var values.
- A scratch end-to-end run of the EGY-flood scenario produces identical scenario results under both flags.

---

### #162 — `base_handler.py` + `run_scenario.py` cleanups + provenance schema

**Track**: 3 — Compute swap
**Depends on**: #161
**Labels**: `phase-6`, `area-7`, `area-20`, `backend`

**Context**

Final compute-side cleanups before validation. Removes the last direct CLIMADA imports outside of the dual-backend branches; migrates the provenance schema; uses the catalog from #161 in `base_handler.py`; collapses `DiscRates` to a scalar in `run_scenario.py`.

**Acceptance criteria**

- [ ] `base_handler.py`:
  - The remaining `climada.util.api_client.Client` import is removed and replaced by `backend.engine.catalog.is_dataset_available`.
  - The `geopandas` import stays (used for non-CLIMADA work).
- [ ] `run_scenario.py`:
  - The `from climada.entity import DiscRates` import is removed.
  - The discount rate is passed as a scalar through the rest of the pipeline.
- [ ] `backend/provenance.py`:
  - The `climada_version` field on the result schema becomes nullable.
  - A new `engine_version: str | None` field is added.
  - When the engine backend produced the result, `engine_version` is filled and `climada_version` is `None`.
  - When the CLIMADA backend produced the result, behaviour is unchanged (backwards compatible for already-stored blobs).
- [ ] DuckDB migration: a new migration file under `backend/db/migrations/` adds the nullable `engine` and `engine_version` columns to the scenario table. Existing rows keep their `climada_version` and have `NULL` in the new fields.
- [ ] Tests `tests/unit/test_provenance_dual_backend.py`:
  - With env=`engine`, the produced provenance dict has `engine_version == <pinned>` and `climada_version is None`.
  - With env=`climada`, the produced provenance dict has `engine_version is None` and `climada_version == "6.1.0"`.

**Key files**

- Modify: `backend/base_handler.py`
- Modify: `backend/run_scenario.py`
- Modify: `backend/provenance.py`
- Create: `backend/db/migrations/000X_provenance_engine_version.sql` (renumber per existing convention)
- Create: `tests/unit/test_provenance_dual_backend.py`

**Scope boundaries (NOT in this issue)**

- No removal of CLIMADA from the dependency manifests (#166).
- No removal of the dual-backend env var (#164 flips the default; the CLIMADA path remains in-tree).

**Verification**

- `pytest tests/unit -q` is green with both env-var values.
- `python -c "from backend.db import open_scenario_store; s = open_scenario_store(); print([r['engine'] for r in s.recent(10)])"` prints `engine`/`climada` markers correctly tagged on new vs old rows.

---

### #163 — Parity test suite (`tests/parity/`)

**Track**: 4 — Validation
**Depends on**: #T3.x complete
**Labels**: `phase-6`, `area-9`, `area-20`

**Context**

Now that every handler has dual-backend branches, run the four reference scenarios from the ADR §6 through both backends and assert outputs agree within the ADR's tolerances. This suite is the gate for #164 (default flip) and the regression guard for every future engine version bump.

**Acceptance criteria**

- [ ] `tests/parity/__init__.py`, `tests/parity/conftest.py`, `tests/parity/snapshots/` exist.
- [ ] `tests/parity/test_egy_flood.py`, `test_egy_drought.py`, `test_tha_flood.py`, `test_custom_data_zip.py` each:
  - Run the scenario via `run_scenario` once with `RISKWISE_ENGINE_BACKEND=climada` and once with `=engine`.
  - Assert `aai_agg` agrees within ±2 %.
  - Assert RP-50, RP-100, RP-250 losses each agree within ±5 %.
  - Assert per-measure BCRs agree within ±5 %.
  - Assert `n_valid_points` and `n_excluded_points` are equal.
  - Snapshot the CLIMADA-side numerical results to `tests/parity/snapshots/legacy/<scenario>.json`. The CLIMADA snapshot is the legacy witness, kept for traceability.
  - Snapshot the engine-side results to `tests/parity/snapshots/engine/<scenario>.json`. The engine snapshot is the new authoritative reference for #164 onward.
- [ ] CI workflow `.github/workflows/parity.yml` runs `pytest tests/parity -q` on every PR labelled `phase-6` and on `main`.
- [ ] A `parity-results.md` summary is generated by the test run (one table per scenario, columns: metric, CLIMADA, engine, delta, gate, pass/fail). Generation happens via a pytest plugin or a small post-test script committed to the repo.

**Key files**

- Create: `tests/parity/__init__.py`
- Create: `tests/parity/conftest.py`
- Create: `tests/parity/test_egy_flood.py`, `test_egy_drought.py`, `test_tha_flood.py`, `test_custom_data_zip.py`
- Create: `tests/parity/snapshots/legacy/<4 files>.json`
- Create: `tests/parity/snapshots/engine/<4 files>.json`
- Create: `tests/parity/_summary.py`
- Create: `.github/workflows/parity.yml`

**Scope boundaries (NOT in this issue)**

- No flipping the default backend — that is #164.
- No removing the legacy snapshots in `tests/unit/impact/test_impact_aal_snapshot.py` — those stay until #164.

**Verification**

- `pytest tests/parity -q` is green.
- `cat tests/parity/_summary.md` shows tabulated deltas, all within gates.

---

### #164 — Flip default backend env var to `engine`

**Track**: 4 — Validation
**Depends on**: #163 (and at least one merge cycle of green parity CI)
**Labels**: `phase-6`, `area-7`, `backend`

**Context**

Once parity has been green in CI for at least one merge cycle and operations are comfortable with the engine path, flip the default. The CLIMADA path remains in-tree as a diagnostic toggle until #166 removes it from runtime deps.

**Acceptance criteria**

- [ ] `RISKWISE_ENGINE_BACKEND` default value changes from `"climada"` to `"engine"` in `backend/engine/__init__.py` (or wherever the default is read).
- [ ] All previous handler-level branches still respect explicit overrides (`RISKWISE_ENGINE_BACKEND=climada` still works).
- [ ] `tests/unit/impact/test_impact_aal_snapshot.py` is **regenerated** against the engine backend. The legacy CLIMADA snapshot moves to `tests/parity/snapshots/legacy/` if it isn't already there.
- [ ] Other unit-test snapshots (cost-benefit, scenario-level result blobs) regenerate similarly. Each regeneration is a deliberate commit with a CHANGELOG entry — no silent updates.
- [ ] CI runs the full `pytest` (unit + integration + parity) on `main` after the flip.
- [ ] A scratch UI run of the EGY-flood-ERA scenario looks identical to its pre-flip behaviour at the chart level (within tolerance) and produces a result blob with `engine_version` populated.

**Key files**

- Modify: `backend/engine/__init__.py`
- Modify: `tests/unit/impact/test_impact_aal_snapshot.py` (regenerated)
- Modify: any other snapshot files that diverge between backends within tolerance
- Modify: `CHANGELOG.md` (record the cutover)

**Scope boundaries (NOT in this issue)**

- No removal of CLIMADA from runtime deps.
- No changes to dependency manifests.

**Verification**

- `pytest -q` is green with no env var set (engine is now the default).
- `RISKWISE_ENGINE_BACKEND=climada pytest -q` is also green (escape hatch still works).

---

### #165 — Bundle benchmark refresh

**Track**: 4 — Validation
**Depends on**: #164
**Labels**: `phase-6`, `area-4`, `devops`

**Context**

`docs/spikes/adr-bundling.md` §4.4 records bundle measurements taken under Track A (CLIMADA + Nuitka). With the engine default flipped, re-run the same measurement protocol and update the table. This validates the §7 bundle target from the Phase 6 ADR.

**Acceptance criteria**

- [ ] `scripts/measure_engine.ps1` runs end to end on the Windows reference hardware described in `docs/spikes/adr-bundling.md` §4.1.
- [ ] `docs/spikes/adr-bundling.md` §4.4 has new rows for "Engine path — Nuitka `--onefile`", "Engine path — Nuitka `--standalone`", "Engine path — PyInstaller `--onedir`". Each row carries bundle size MB, cold-start s, scenario-runtime s, delta vs unbundled.
- [ ] `docs/reference/benchmarks.md` has a new "v2.x — engine cutover" section recording the same measurements.
- [ ] Bundle size is ≤ 250 MB on at least one configuration (per ADR §7 target). If above, file a Phase 7+ issue documenting the gap before this issue closes.
- [ ] The bundled `.exe` runs the EGY-flood-ERA scenario end to end (this is the `--onefile` smoke; not a perf number, just a "did it boot").

**Key files**

- Modify: `docs/spikes/adr-bundling.md` (§4.4 rows)
- Modify: `docs/reference/benchmarks.md` (new section)
- Modify (potentially): `scripts/measure_engine.ps1` (drop CLIMADA-specific Nuitka flags if needed)

**Scope boundaries (NOT in this issue)**

- No removal of `climada` from manifests (#166) — this issue runs the measurement against a tree that still *can* select CLIMADA via env var, but the **default** path measured is the engine path.
- No changes to the bundler / signing pipeline.

**Verification**

- `Get-Content docs/spikes/adr-bundling.md` shows the new table rows fully populated (no `TBD`).
- `dist/<bundler>/<engine-build>.exe` runs the smoke scenario.

---

### #166 — Remove `climada==6.1.0` from runtime deps

**Track**: 5 — Removal & docs
**Depends on**: #165 (and at least one minor-release window of soak)
**Labels**: `phase-6`, `area-4`, `area-18`, `devops`

**Context**

The point of no return. Removes CLIMADA from `pyproject.toml`, `requirements/requirements.txt`, `requirements/environment.yml`. Drops the CLIMADA branches from the dual-backend handlers. Drops `tests/test_climada_pin.py`. Updates SBOM and NOTICES.txt.

**Acceptance criteria**

- [ ] `pyproject.toml`: `climada==6.1.0` removed from `[project.dependencies]`.
- [ ] `requirements/requirements.txt`: `climada==6.1.0` line removed.
- [ ] `requirements/environment.yml`: `climada==6.1.0` line removed.
- [ ] `pip install -e .` in a clean venv resolves without `climada`.
- [ ] `python -c "import climada"` raises `ModuleNotFoundError`.
- [ ] All handlers (`impact_handler.py`, `costben_handler.py`, `hazard_handler.py`, `exposure_handler.py`, `entity_handler.py`, `base_handler.py`, `run_scenario.py`) drop their CLIMADA branches. The env-var helper either becomes a no-op (always returns `engine`) or is removed entirely. Pick whichever produces a smaller diff; the env var being a no-op is fine.
- [ ] `tests/test_climada_pin.py` is deleted.
- [ ] SBOM regenerated (`scripts/generate_sbom.py` or the equivalent CI step) — no CLIMADA entry.
- [ ] NOTICES.txt regenerated (`scripts/generate_notices.py`) — no CLIMADA entry; engine entry added.
- [ ] `pip-audit` clean against the new tree.
- [ ] CI lint rule from #151 strengthens to forbid even the legacy CLIMADA imports — any `climada` import anywhere in `backend/` fails CI.

**Key files**

- Modify: `pyproject.toml`
- Modify: `requirements/requirements.txt`
- Modify: `requirements/environment.yml`
- Modify: each handler in `backend/{impact,costben,hazard,exposure,entity}/` and `backend/{base_handler,run_scenario}.py` (drop CLIMADA branches)
- Delete: `tests/test_climada_pin.py`
- Modify: `sbom.json` (regenerate)
- Modify: `NOTICES.txt` (regenerate)

**Scope boundaries (NOT in this issue)**

- v1 CLIMADA-only handler tests (`backend/{impact,exposure,hazard}/test_*_handler.py`) are deleted in #167 — left here would block CI and conflate two changes.
- Documentation final pass is #168.

**Verification**

- `pip install -e . && python -c "import climada"` raises `ModuleNotFoundError`.
- `pytest tests/unit tests/integration tests/parity -q` is green.
- `git grep "from climada"` and `git grep "import climada"` return zero hits in `backend/`.

---

### #167 — Delete v1 CLIMADA-only handler tests

**Track**: 5 — Removal & docs
**Depends on**: #166
**Labels**: `phase-6`, `area-9`

**Context**

The v1-legacy handler tests under `backend/{impact,exposure,hazard}/test_*_handler.py` import CLIMADA directly. Now that CLIMADA is gone from runtime deps, those tests would fail to import. They have been excluded from CI lint/mypy since Phase 1 and their meaningful assertions are covered by the engine-branch tests added in Track 3 plus the parity suite from #163.

**Acceptance criteria**

- [ ] `backend/impact/test_impact_handler.py` deleted.
- [ ] `backend/exposure/test_exposure_handler.py` deleted.
- [ ] `backend/hazard/test_hazard_handler.py` deleted.
- [ ] If any one of those tests asserted something not yet covered by an engine-branch or parity test, that assertion is ported into a new test under `tests/unit/<area>/`. The PR description lists each ported assertion.
- [ ] `pyproject.toml` `[tool.pytest.ini_options]` excludes / includes are updated if needed.

**Key files**

- Delete: `backend/impact/test_impact_handler.py`
- Delete: `backend/exposure/test_exposure_handler.py`
- Delete: `backend/hazard/test_hazard_handler.py`
- Possibly: new tests under `tests/unit/<area>/` for ported assertions
- Possibly: `pyproject.toml` (pytest config tweaks)

**Scope boundaries (NOT in this issue)**

- No new test infrastructure.
- No deletion of `tests/parity/snapshots/legacy/` — those are kept as the historical witness per the ADR.

**Verification**

- `pytest -q` is green.
- `git grep "import climada"` and `git grep "from climada"` return zero hits anywhere in the repo.

---

### #168 — Docs final pass (DECISIONS, ARCHITECTURE, exit criteria)

**Track**: 5 — Removal & docs
**Depends on**: #166
**Labels**: `phase-6`, `documentation`

**Context**

Close the documentation loop. Update DECISIONS.md, ARCHITECTURE.md, and this phase file's exit criteria. Confirm all references to CLIMADA in user-facing docs are accurate post-cutover (e.g., README install instructions, contributor docs).

**Acceptance criteria**

- [ ] `docs/DECISIONS.md`:
  - D05 marked as superseded by D18 (cross-link both ways).
  - D18 status updated from "Design accepted" / "Pending cutover" to "Accepted; in production".
  - Any other D-numbers that referenced CLIMADA-only behaviour are reviewed and updated.
- [ ] `docs/ARCHITECTURE.md`:
  - Areas 4, 6, 7, 11, 18, 20: replace any CLIMADA references with engine references where the behaviour has actually changed.
  - Verification Criteria tables for those Areas updated.
- [ ] `docs/plan/phase-6-engine-migration.md` (this file): every Exit criterion checkbox checked.
- [ ] `docs/plan/README.md`: Phase 6 status moved to ✅ Done; "Active phase" pointer moved to whatever is next.
- [ ] `README.md` (repo root): install / setup instructions mention the engine, not CLIMADA.
- [ ] `CONTRIBUTING.md`: the lint rule preventing direct engine imports outside `backend/engine/` is documented.
- [ ] `CHANGELOG.md`: a "Phase 6 — Engine Migration" entry covering D18, the dependency change, the bundle delta, and the new provenance schema.

**Key files**

- Modify: `docs/DECISIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/plan/phase-6-engine-migration.md`
- Modify: `docs/plan/README.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md`

**Scope boundaries (NOT in this issue)**

- No code changes.
- No removal of historical references to CLIMADA in DECISIONS.md or older phase files — those are correct as a record of what was true at the time.

**Verification**

- `git diff main -- docs/` shows the expected updates.
- A first-time reader can install riskwise from a clean checkout following only `README.md` instructions.

---

### #169 — (Conditional) upstream engine PRs for any gaps surfaced

**Track**: 5 — Removal & docs (workflow placeholder)
**Depends on**: open across the phase
**Labels**: `phase-6`

**Context**

This is the meta-issue that captures the upstream-PR workflow from the cross-project compatibility contract (ADR §5). It does not produce code in `riskwise-v2`. It is opened once at the start of Phase 6 and closes when the phase ends. Each gap surfaced during Tracks 2–4 spawns a sub-issue *in the engine repo*, not here.

**Acceptance criteria**

- [ ] At Phase 6 start, this issue's body lists the cross-project contract from ADR §5 verbatim.
- [ ] As Phase 6 progresses, every upstream engine PR is linked from this issue's comments. For each link:
  - Brief description of the gap (one sentence).
  - Affected engine API entries.
  - Backbone-compat test passing (link to engine repo CI).
  - Riskwise-compat test passing (link to engine repo CI).
  - Engine version that includes the fix.
  - Riskwise pin update PR (link).
- [ ] At Phase 6 close, this issue summarises:
  - Total upstream PRs opened.
  - Net additions to engine public API (from §5.1 list).
  - Whether any consumer-side workarounds were introduced (should be zero per §5.1 rule 2).

**Key files**

- None in `riskwise-v2`. This issue's deliverable is a curated comment thread linking engine PRs.

**Scope boundaries (NOT in this issue)**

- All concrete code lives in the engine repo's PRs.
- This issue must NOT carry any `riskwise-v2` code changes.

**Verification**

- At close, the issue's comments form a coherent log of every cross-repo change in Phase 6.
