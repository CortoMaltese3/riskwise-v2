# ADR — Adopt `climate-lama-engine` as the riskwise-v2 compute layer (supersedes D05)

**Status:** Design accepted; cutover gated on the parity smoke (§9) and the Phase 4 v2.0.0 tag.
**Date:** 2026-04-26
**Issue:** #150 (Phase 6 gate; opened against this ADR's merge)
**Supersedes:** [DECISIONS.md D05](../DECISIONS.md) — Track A (CLIMADA + Nuitka) and the won't-do closure of spike #4 (Track B).
**Depends on:** Phase 4 release-readiness verification — v2.0.0 must ship on Track A first.
**Cross-reference:** [adr-bundling.md](adr-bundling.md) (re-baselined in §7), [climate-lama-engine v0.4.0 spec](../../../climate-lama-engine/docs/CLIMATE_LAMA_ENGINE.md), [climate-lama backbone engine adapter](../../../climate-lama/src/climate_lama/worker/models/engine_adapter.py).
**Informs:** Phase 6 plan ([phase-6-engine-migration.md](../plan/phase-6-engine-migration.md)).
**Related architecture:** ARCHITECTURE.md Areas 4 (lean backend), 6, 7, 11, 18, 20.

---

## 1. Scope and outcome

Replace the runtime CLIMADA dependency in riskwise-v2 (`climada==6.1.0`) with `climate-lama-engine`, the maintainer's NumPy/SciPy-only compute library that already powers the climate-lama backbone product. Phase 6 does this surgically: the v1-legacy handlers keep their shape, only the compute and loader call sites change, and the cross-repo contract between `climate-lama-engine`, `climate-lama` (backbone), and `riskwise-v2` is formalised so future engine work serves both consumers.

The decision in D05 — selecting Track A (CLIMADA + Nuitka) and closing spike #4 — was correct **at the time** because engine v0.1 covered river flood only. Engine v0.4.0 (released 2026-04-20) now covers the full risk-assessment surface riskwise needs and is in production use in the backbone. Reopening D05 with this ADR captures that change in fact.

This ADR ships:

- The capability assessment (§3) that justifies adoption.
- The cross-project compatibility contract (§5) that survives Phase 6 and governs all future engine work.
- The parity gates (§6) and bundle reality check (§7) that the cutover must meet.
- The roadmap appendix (§10) describing how engine growth maps to riskwise features.
- The rollback plan (§11).

The empirical artefact — the parity smoke run that confirms the Egypt-flood and Egypt-drought scenarios meet the §6 gates — is the only thing this ADR cannot decide on paper alone. §9 captures it as the single outstanding item.

---

## 2. Context: where CLIMADA lives in riskwise-v2 today

`climada==6.1.0` is the runtime compute dependency. Direct imports across the backend (verified 2026-04-26):

| File | CLIMADA imports |
|---|---|
| `backend/impact/impact_handler.py` | `Impact`, `ImpactCalc`, `Exposures`, `ImpactFuncSet`, `Hazard` |
| `backend/impact/registry.py` | `ImpactFunc`, `ImpactFuncSet` |
| `backend/costben/costben_handler.py` | `CostBenefit`, `ImpactCalc`, `NO_MEASURE`, `risk_aai_agg`, `DiscRates`, `Entity`, `Hazard` |
| `backend/entity/entity_handler.py` | `DiscRates`, `Entity`, `Exposures`, `MeasureSet`, `ImpactFuncSet`, `Client` (CLIMADA API) |
| `backend/exposure/exposure_handler.py` | `Exposures` |
| `backend/hazard/hazard_handler.py` | `Entity`, `Hazard` |
| `backend/base_handler.py` | `Client` (CLIMADA API) |
| `backend/run_scenario.py` | `DiscRates` |
| `tests/test_climada_pin.py` | Version validation only |

Independent geospatial deps that are *not* CLIMADA but ride on the same native stack:

| Library | Direct `import` count | Role |
|---|---|---|
| `geopandas` | 4 (`base_handler`, `impact_handler`, `exposure_handler`, `hazard_handler`) | GeoJSON output, GeoDataFrame ops, GeoPackage ingest |
| `shapely.geometry.Point` | 2 (`impact_handler`, `hazard_handler`) | Point construction |
| `rasterio`, `h5py`, `pyproj`, `fiona` | 0 today | Currently transitive via CLIMADA; `rasterio` and `h5py` become direct deps in Phase 6 loaders |

CLIMADA pins propagated to `pyproject.toml`, `requirements/requirements.txt`, and `requirements/environment.yml` per D05. Phase 4 bundled the runtime via Nuitka with the dependency baseline in [adr-bundling.md §2.1](adr-bundling.md#21-kept-14-packages).

---

## 3. Capability assessment — engine v0.4.0 vs CLIMADA 6.1.0 against riskwise needs

The engine is a **compute-only** library (numpy + scipy; no I/O, no GIS). The capability assessment therefore splits into:

- **Compute parity** — does the engine produce equivalent numbers from equivalent inputs?
- **Coverage parity** — does the engine accept the inputs riskwise actually has?

### 3.1 Compute parity (the things the engine does)

| Capability | CLIMADA 6.1.0 | Engine v0.4.0 | Riskwise gap? |
|---|---|---|---|
| `Hazard` class (sparse intensity, frequencies, centroids) | Subclass hierarchy per type | Single `Hazard` dataclass; type is a free-form string | None. Riskwise treats hazard type as a string already. |
| Return-period maps (RP-band hazards) | `Hazard.from_excel`/`from_raster` with implicit RP semantics | `Hazard.from_rp_maps(return_periods, intensity_maps)` — explicit marginal-frequency conversion | None. Cleaner contract. |
| `Exposures` | GeoDataFrame-backed | Plain numpy arrays + lat/lon + `centroid_idx` | None. Riskwise pre-computes centroid indices per the loader contract. |
| `ImpactFunc` (MDD/PAA curves) | Yes | Yes; identical interpolation contract (`MDR = interp(MDD) × interp(PAA)`) | None. |
| `ImpactCalc` | Yes | Yes; chunked vectorisation (faster on >100K-point portfolios per engine `test_performance.py`) | None. |
| `Impact` outputs (`aai_agg`, `at_event`, `eai_exp`) | Yes | Yes; same names, same semantics | None. |
| Frequency curves (loss-exceedance per RP) | `Impact.calc_freq_curve` | `cc.calc_freq_curve(impact, return_periods=…)` — module function, not method | Trivial signature change. |
| Cost-benefit (NPV, BCR, future hazard) | `CostBenefit` class | `cc.calc_cost_benefit(hazard_present, hazard_future, exposures, impfset, measures, discount_rate, present_year, future_year)` — function, not class | None. Function signature is closer to riskwise's call site. |
| Discount rates | `DiscRates(years, rates)` | scalar `discount_rate` parameter | Riskwise passes a single rate; collapse trivially. |
| Adaptation measures | `Measure` + `MeasureSet` | `Measure` dataclass; no formal `MeasureSet` registry | Riskwise builds a list directly. |
| Bootstrap EAD CIs | Via add-ons | `cc.bootstrap_ead_ci(...)` natively | Engine has it; riskwise's UI doesn't expose it yet. Future opportunity. |
| Centroid assignment (KDTree) | `assign_centroids` | `cc.assign_centroids` (same algorithm: KDTree on lat/lon with `cos(lat)` scaling) | None. |

### 3.2 Coverage parity (the things the engine deliberately does not do)

The engine is intentionally a **compute layer**. The following CLIMADA capabilities live outside it; in Phase 6 these become riskwise's responsibility (loaders + adapter):

| CLIMADA capability | Engine? | Phase 6 owner |
|---|---|---|
| HDF5 hazard read | `Hazard.from_hdf5` | **No** | New: `backend/engine/loaders/hdf5.py` (#153) |
| GeoTIFF / raster hazard read | `Hazard.from_raster` | **No** | New: `backend/engine/loaders/raster.py` (#154) |
| MAT hazard read | `Hazard.from_mat` | **No** | Dropped (locked decision #6); add on demand |
| XLSX entity / exposure read | `Entity.from_excel` | **No** | New: `backend/engine/loaders/xlsx.py` (#155) |
| GADM admin boundaries / LitPop | bundled data | **No** | Out of scope; riskwise ships per-country files already |
| `Client` (CLIMADA dataset API) | `climada.util.api_client.Client` | **No** | Replaced with `data/catalog.json` local catalog (locked decision #4) |
| `Entity` aggregator (Exposures + ImpactFuncSet + DiscRates + MeasureSet) | bundled class | **No** | New: `EntityBundle` dataclass in `backend/engine/types.py` (#152) |
| Hazard generators (synthetic TC tracks, parametric flood, wildfire spread) | Yes | **No** | Out of scope; riskwise loads pre-computed files. Captured as engine roadmap §10. |
| CMIP6 / xarray climate data ingest | Yes (v6.1.0+) | **No** | Out of scope; captured as engine roadmap §10. |
| Calibration / uncertainty ensembles | Yes (v6+) | Bootstrap CI only | Out of scope; captured as engine roadmap §10. |
| Plotting | Yes | **No** | Out of scope (per global memory: charts rendered in JS from backend-supplied data). |

### 3.3 The drought caveat (decreasing-with-intensity SPI curves)

Riskwise's drought hazard uses Standardized Precipitation Index, where damage **decreases** as intensity rises (drier = more negative SPI = more damage). The engine's `ImpactFunc.calc_mdr` accepts non-monotonic-with-direction MDD/PAA curves (the math is `MDR = interp(MDD) × interp(PAA)`, agnostic to direction); riskwise's existing registry in `backend/impact/registry.py` already validates either direction, so the data contract is already engine-compatible.

The risk is that the engine has primarily been exercised against flood/TC/wildfire (the backbone product's hazards), so drought is a *new* shape for it. §9 (parity smoke) is the empirical answer.

---

## 4. The decision: adopt `climate-lama-engine`

**We adopt `climate-lama-engine` as the runtime compute layer for riskwise-v2** under the following conditions:

1. The cutover lands **after** v2.0.0 is tagged on Track A (no rework of Phase 4 work).
2. The parity gates in §6 are met on the reference scenarios.
3. The cross-project compatibility contract in §5 is in force from #150 merge onward.
4. The bundle target in §7 is recorded and re-measured at cutover.

If the parity smoke (§9) fails any reference scenario beyond the §6 gates, the failure path is to open an upstream PR against the engine (per §5) — **not** to abandon the migration. Engine, riskwise, and the backbone are all under one maintainer; "upstream the fix" is always the right path.

---

## 5. Cross-project compatibility contract (load-bearing)

`climate-lama-engine` will, after Phase 6, have **two consumers**: `climate-lama` (backbone, web product) and `riskwise-v2` (Electron desktop). The engine's evolution must serve both, forever. This section is the contract. It outlives Phase 6.

### 5.1 The five rules

1. **Public API is the union of consumer dependencies.** Today: `Hazard`, `Exposures`, `ImpactFunc`, `ImpactFuncSet`, `ImpactCalc`, `Impact`, `Measure`, `calc_freq_curve`, `calc_cost_benefit`, `assign_centroids`, `bootstrap_ead_ci`. Anything outside that set is internal and can change freely.
2. **No consumer-side workarounds for engine bugs/gaps.** Fix path is upstream. No quiet patches in `backend/engine/adapter.py` or in `engine_adapter.py`.
3. **Every engine PR ships with a backbone-compat test and a riskwise-compat test.** Both live inside the engine repo. They mirror the real adapter contracts. A PR that breaks either does not merge.
4. **Coordinated releases.** When the engine bumps version, both consumers update their pins in the same release window. Engine release notes list which API entries changed and which consumer drove the change.
5. **Hard pins.** `climate-lama-engine==X.Y.Z`, not `>=X.Y.Z`. Mirrors CLIMADA's `==6.1.0` pin philosophy from D05.

### 5.2 Workflow when a Phase 6 task discovers an engine gap

1. Land a backbone-compat test inside the engine repo first (regression baseline).
2. Open the engine PR with the new feature/fix, plus a new riskwise-compat test alongside the backbone-compat test.
3. Merge → bump engine to next version → publish to PyPI.
4. Update riskwise's pin in the next #T1.x or #T3.x PR.
5. Update backbone's pin if its tests benefit (often a no-op).

### 5.3 PR template (engine repo)

Every engine PR opened during Phase 6 (and after) MUST include:

- A summary of the API change (or "no API change").
- The list of affected public API entries (from §5.1).
- The backbone-compat test (added or kept passing).
- The riskwise-compat test (added or kept passing).
- A note in the PR description naming the consumer use case driving the change.

This template is written into the engine repo as `.github/PULL_REQUEST_TEMPLATE.md` as part of #150's deliverable.

---

## 6. Parity gates

Cutover from CLIMADA to engine is gated on a parity test suite (`tests/parity/`) that runs the same input through both libraries and asserts the outputs agree within the following tolerances:

| Metric | Tolerance | Rationale |
|---|---|---|
| `aai_agg` (Average Annual Loss) | ±2 % | Original D05 / spike #4 gate |
| Loss at RP 50, 100, 250 | ±5 % per RP | Original D05 / spike #4 gate |
| Cost-benefit BCR per measure | ±5 % | Same numerical class as RP losses |
| `n_valid_points`, `n_excluded_points` | exact (=) | Categorical, must match |
| `frequency_type` round-trip | exact (=) | Contract integrity |

Reference scenarios for the parity suite (must all pass):

1. **Egypt flood ERA** — present + future, full cost-benefit. The Phase 4 baseline scenario.
2. **Egypt drought ERA** — present-only. Stresses the decreasing-with-intensity SPI curve (§3.3).
3. **Thailand flood ERA** — present + future. Different country to confirm registry-driven impact functions are engine-portable.
4. **One custom-data ZIP** — a user-uploaded country pack, end-to-end. Stresses the loader contract for non-curated inputs.

The parity suite runs in CI on every Phase 6 PR and stays in the test tree post-cutover as a regression guard against engine version bumps (per §5.4).

---

## 7. Bundle reality (R1 corrected)

[adr-bundling.md §6](adr-bundling.md#6-cross-reference-with-climate_lama_engine-track-b) imagined Track B at "~50 MB". That number assumed CLIMADA was the only heavy thing. It wasn't.

The bundle keeps these direct deps post-Phase-6:

| Library | Why it stays |
|---|---|
| `geopandas` | `generate_exposure_geojson()`; GeoDataFrame ops; GeoPackage ingest |
| `rasterio` | New direct dep — flood-raster loader |
| `h5py` | New direct dep — HDF5 hazard loader |
| `openpyxl`, `xlsxwriter` | XLSX entity/measures read + scenario export |
| `pyarrow` | DuckDB, parquet sidecar caching |
| `duckdb` | Scenario store |
| `fastapi`, `uvicorn[standard]` | HTTP loopback engine |
| `pycountry` | ISO3 mapping |
| `numpy`, `scipy` | Engine's own deps + transitive |
| `pydantic` | Type contract |
| `climate-lama-engine` | The compute layer itself |

Plus transitives that come along whether listed or not: `gdal`, `pyproj`, `fiona`/`pyogrio`, `shapely`. These are not free, but they are not "extra" beyond what `geopandas` + `rasterio` already force.

**Realistic bundle target: ~150–250 MB**, vs ~500 MB current. Still a 50–70 % reduction. #165 measures the exact number; if it lands above target, a Phase 7+ ADR can evaluate dropping `geopandas` + `rasterio` in favour of flat formats. That is a *data-format* migration, not an engine migration.

---

## 8. Provenance schema migration

`backend/provenance.py:82,127,223` records `climada_version` in every scenario result blob (the scientific-reproducibility record per [REPRODUCIBILITY_NOTE](../../backend/provenance.py)). Post-cutover this becomes:

```python
provenance = {
    ...
    "engine": "climate-lama-engine",
    "engine_version": "0.4.0",          # hard-pinned per §5.1 rule 5
    "climada_version": None,            # null marker — preserved for legacy scenario blobs
    ...
}
```

Legacy scenario blobs retain their `climada_version` field; new blobs carry `engine_version` instead. The DuckDB scenario-store schema accommodates both via nullable columns (#162 handles the migration).

---

## 9. Outstanding work (the only empirical item)

- [ ] **Parity smoke (pre-cutover, gates Phase 6 Track 4)**: run scenarios 1–4 from §6 through both CLIMADA and a hand-rolled engine adapter; record `aai_agg`, RP-50/100/250, cost-benefit BCRs in `docs/spikes/parity-smoke-results.md`. If any row exceeds §6 tolerances, file the gap as an upstream engine issue and gate cutover on its resolution.

This is the only thing this ADR cannot decide on paper. Everything else (capability assessment, contract, roadmap, rollback) is decided here.

---

## 10. Engine roadmap appendix — opportunities Phase 6 unlocks

Not Phase 6 deliverables. Captured here so future phases inherit a coherent direction. Each row is a candidate engine-side feature; the riskwise-side feature is what we get for free once it lands upstream.

| Engine feature | Riskwise UX win | Priority |
|---|---|---|
| Parametric TC wind (Holland 2008) | Removes pre-baked TC HDF5 files from installer; user picks landfall + intensity | P1 — highest installer-size win |
| CMIP6 climate scaling utility | Continuous warming-level slider in UI; one present-day hazard file covers all scenarios | P2 — biggest UX upgrade |
| Calibration framework (fit MDD/PAA from observed losses) | "Tune to my historical losses" workflow | P3 — biggest commercial-user win |
| Variance-based sensitivity (Sobol / Morris) | Tornado charts showing loss drivers | P4 — well-bounded scope |
| Insurance portfolio math (premiums, layers, reinsurance) | (Re)insurance-market product shape | P5 — opens new segment |
| Multi-hazard / compound events | Realistic coastal flood + TC compound scenarios | P6 — domain depth |
| xarray / NetCDF bridge | Direct CMIP6 / ERA5 ingest | P7 — depends on P2 |
| LitPop / population-grid exposure builder | Build exposure for any country from open data | P8 — broadens user base |
| Operational forecast module | Early-warning platform — new product shape | Speculative |
| Validation technical note (engine vs CLIMADA on a published benchmark) | Scientific credibility for institutional users | Near-term, doc-only |

The validation note is **not code**; it is a 5–10 page technical write-up living in `climate-lama-engine/docs/validation/`. Worth opening as the first post-Phase-6 deliverable on the engine repo because it pays back enormously for academic and governmental users.

---

## 11. Rollback plan

Phase 6 ships behind the per-handler env-var feature flag `RISKWISE_ENGINE_BACKEND` (default `climada` until #164 flips it to `engine`). This means:

- During Tracks 1–3: setting `RISKWISE_ENGINE_BACKEND=climada` reverts every handler to the CLIMADA path. No deployment risk.
- After #164 (default flipped): the CLIMADA path stays in-tree as a diagnostic toggle through the whole of #T5.x. Operations can downgrade by setting the env var.
- After #166 (CLIMADA removed from runtime deps): rollback requires a `git revert` of the #166 PR plus a re-install. This is the point of no return.

If an unforeseen regression surfaces between #164 and #166, the env-var rollback is one operations change. After #166 the rollback cost rises sharply — which is why #166 only runs after parity has been green in the wild for at least one minor release window.

---

## 12. New decision (DECISIONS.md entry)

This ADR introduces a new decision in `docs/DECISIONS.md` that supersedes D05. Provisional number **D18**; renumber if the file has grown.

**D18 — Adopt `climate-lama-engine` as the runtime compute layer (post-v2.0).**

- **Decision**: Replace `climada==6.1.0` with `climate-lama-engine==<cutover-version>` in Phase 6, after v2.0.0 has tagged on Track A.
- **Why now**: Engine v0.4.0 covers the full risk-assessment surface riskwise needs; it is in production use in the climate-lama backbone; reopening D05 captures the change in fact.
- **Why not earlier**: Engine v0.1 covered only river flood at the time of D05.
- **Trade-offs accepted**: Smaller bundle, simpler dependency tree, easier hazard extensibility — at the cost of writing our own file loaders (HDF5, GeoTIFF, XLSX) and our own dataset catalog (replacing CLIMADA's `Client`).
- **Supersedes**: D05.
- **Cross-references**: This ADR; [phase-6-engine-migration.md](../plan/phase-6-engine-migration.md); the engine repo's compatibility contract.

---

## 13. References

- [DECISIONS.md D05](../DECISIONS.md) — the decision this ADR supersedes.
- [adr-bundling.md](adr-bundling.md) — Track A vs B framing; §6 of that ADR is re-baselined here in §7.
- [climate-lama-engine v0.4.0 PyPI page](https://pypi.org/project/climate-lama-engine/) — source of truth for the public API surface.
- [climate-lama backbone engine adapter](../../../climate-lama/src/climate_lama/worker/models/engine_adapter.py) — the array-in/array-out contract template the riskwise-side adapter mirrors.
- [phase-6-engine-migration.md](../plan/phase-6-engine-migration.md) — the execution plan that consumes this ADR.
