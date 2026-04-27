# Parity smoke — `climate-lama-engine` v0.4.0 vs CLIMADA 6.1.0

**Status**: 7 of 12 planned scenarios passing. Engine and CLIMADA are numerically equivalent on every metric tested so far at `rtol=1e-6`.
**Last updated**: 2026-04-28
**Owner**: Phase 6 / [#150](https://github.com/CortoMaltese3/riskwise-v2/issues/150)

---

## What this document is

The parity smoke that gates riskwise-v2's adoption of `climate-lama-engine` (per [adr-climate-lama-engine-adoption.md §6](adr-climate-lama-engine-adoption.md#6-parity-gates) and [DECISIONS.md D26](../DECISIONS.md#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20)). Rather than duplicate the runs here, the canonical artifact is **the engine repo's notebook**:

- **File**: [`notebooks/08_climada_comparison.ipynb`](https://github.com/gkalomalos/climate-lama-engine/blob/main/notebooks/08_climada_comparison.ipynb) in the `climate-lama-engine` repo
- **Reference commit (engine)**: `a30a6e4d1e8189f2703b39c0d064246085d3dd8e`
- **Engine version validated**: v0.4.0
- **CLIMADA version validated against**: 6.1.0 (matches the riskwise-v2 runtime pin)
- **Tolerance**: `rtol=1e-6` for direct compute metrics (`aai_agg`, `at_event`, `eai_exp`, fraction matrix, insured impact, post-measure impact, exceedance curve); `rtol=5e-3` for derived stats with discounting or RNG

The notebook executes both libraries on identical synthetic inputs and prints `[OK]` / `[FAIL]` per metric. This document records the result summary and the scenario coverage map.

---

## Scenario coverage

| # | Scenario | Status | Engine API exercised | Tolerance |
|---|---|---|---|---|
| 1 | Baseline impact (RP maps, 3 events) | ✅ | `Hazard.from_rp_maps`, `Exposures`, `ImpactFunc`, `ImpactCalc` | `rtol=1e-6` |
| 2 | Multiple impact functions (residential + industrial) | ✅ | `ImpactFuncSet` with two `impf_id` routing | `rtol=1e-6` |
| 3 | Fraction matrix (partial inundation, 0.5×) | ✅ | `Hazard(fraction=…)` | `rtol=1e-6` |
| 4 | Insurance (deductible + cover) | ✅ | `Exposures(deductible=…, cover=…)` | `rtol=1e-6` |
| 5 | Adaptation measure: intensity reduction | ✅ | `Measure.apply(haz, impfset)` | `rtol=1e-6` |
| 6 | Exceedance frequency curve | ✅ | `cc.calc_freq_curve` | `rtol=1e-4` |
| 7 | Larger scale (JRC 6 RPs × 20 centroids × 10 exposures) | ✅ | Numerical-stability stress | `rtol=1e-6` |
| 8 | Cost-benefit: single measure, present + future | 🔲 planned | `cc.calc_cost_benefit` | `rtol=5e-3` (BCR, NPV) |
| 9 | Cost-benefit: multi-measure BCR ranking | 🔲 planned | `cc.calc_cost_benefit` with measure list | `rtol=5e-3` + exact rank order |
| 10 | Decreasing-with-intensity impact (drought / SPI-style) | 🔲 planned | Non-monotonic `ImpactFunc` for `haz_type="DR"` | `rtol=1e-6` |
| 11 | `assign_centroids` parity | 🔲 planned | `cc.assign_centroids` (custom-data flow) | exact (=) per-row |
| 12 | `bootstrap_ead_ci` confidence interval | 🔲 planned | `cc.bootstrap_ead_ci` (seeded RNG) | `rtol=5e-3` |

Status legend: ✅ in tree, all metrics `[OK]` · 🔲 planned, prompt drafted in riskwise-v2 PR #176 conversation · ❌ in tree, ≥1 metric `[FAIL]`

---

## What the 7 currently passing scenarios validate

Together they cover the engine's compute surface that riskwise-v2 calls today:

- **`Hazard` construction from RP maps** (Scenarios 1, 3, 5, 7) — riskwise's hazard loaders produce RP-mapped intensity matrices for flood / heatwave; engine's `from_rp_maps` is the equivalent of CLIMADA's implicit RP semantics, with explicit marginal-frequency conversion. Confirmed equivalent.
- **`Exposures` with pre-assigned `centroid_idx`** (Scenarios 1–7) — riskwise pre-assigns centroid indices to bypass geographic lookup; both engine and CLIMADA accept this shape and produce identical impacts.
- **`ImpactFunc` / `ImpactFuncSet`** (Scenario 2 specifically) — multiple-impact-function routing via `impf_id` works identically in both libraries.
- **`ImpactCalc`** (every scenario) — the core compute path. `aai_agg`, `at_event`, `eai_exp` outputs match across all 7 scenarios.
- **`fraction` matrix** (Scenario 3) — partial inundation handling matches.
- **Insurance fields** (Scenario 4) — `deductible` + `cover` produce identical insured impacts.
- **`Measure.apply`** (Scenario 5) — single-measure intensity reduction transforms hazard identically.
- **`calc_freq_curve`** (Scenario 6) — exceedance loss interpolation at named return periods matches.

The 7 scenarios also include identity checks:
- `eai_exp.sum() == aai_agg`
- `at_event @ frequency == aai_agg`

Both hold in the engine.

---

## What the 5 planned scenarios add

The five planned additions (8–12 in the table above) close gaps that the riskwise adoption depends on:

- **Cost-benefit (8, 9)** — `cc.calc_cost_benefit` powers riskwise's CB chart and the measure-ranking workflow. Currently the only major engine API entry without parity coverage.
- **Drought-style impact functions (10)** — Egypt drought + Thailand drought ERA scenarios use SPI curves where the impact function is non-monotonic in intensity. Engine v0.4.0 has explicit handling per ADR §3.3; needs validation that CLIMADA's interpolator agrees on this case.
- **`assign_centroids` (11)** — riskwise pre-assigns indices, but the custom-data upload flow uses the engine's `assign_centroids` directly. Both libraries must produce identical assignments.
- **`bootstrap_ead_ci` (12)** — listed in the §5.1 contract API surface but currently untested.

Until these land, the parity smoke is **substantially complete but not exhaustive**. The 7 in tree exercise the riskwise-v2 hot path (hazard → exposures → impf → impact); the 5 planned cover the cost-benefit hot path and the contract-edge cases.

---

## What the parity smoke does NOT cover

By design — these are tested elsewhere or in a different layer:

- **Real ERA scenarios** (Egypt flood end-to-end, etc.) — those need riskwise's loaders + handlers and belong in `riskwise-v2/tests/parity/` under [#163](https://github.com/CortoMaltese3/riskwise-v2/issues/163). This notebook validates **engine library ↔ CLIMADA library** parity on synthetic data; #163 validates **riskwise + engine ↔ riskwise + CLIMADA** integration on real data.
- **Performance** — covered by `tests/test_performance.py` in the engine repo and by the riskwise scenario benchmarks in [`docs/reference/benchmarks.md`](../reference/benchmarks.md).
- **Loader correctness** — riskwise's HDF5 / GeoTIFF / XLSX loaders are riskwise-internal; their parity is a Phase 6 Track 1–2 concern (#153, #154, #155).

---

## Acceptance for adopting this as the parity baseline (#150)

- [x] Notebook is reproducible against pinned engine + CLIMADA versions
- [x] All in-tree scenarios pass at the documented tolerance
- [x] Notebook reference commit SHA is recorded above (so a future re-run can reproduce the baseline)
- [x] Coverage map is honest about what's in tree vs planned
- [ ] Five planned scenarios (8–12) added — tracked separately; this doc gets a one-line update when they land
- [ ] Notebook re-run gating built into the engine repo's CI (planned per ADR §6.4)

The four "[x]" boxes are sufficient to ratify ADR §6 and unlock the rest of Phase 6 design. The two "[ ]" boxes are scheduled improvements that do not block the ratification.

---

## How to re-run the smoke

```bash
# In the climate-lama-engine repo, with the conda env that has both
# climate-lama-engine and climada installed:
cd ../climate-lama-engine
jupyter nbconvert --to notebook --execute notebooks/08_climada_comparison.ipynb \
  --output notebooks/08_climada_comparison.executed.ipynb
```

A successful run shows every output line ending in `[OK]` and no Python traceback. A `[FAIL]` line, an `AssertionError`, or a kernel crash means a regression — investigate before bumping the engine pin in riskwise-v2.

---

## References

- [adr-climate-lama-engine-adoption.md](adr-climate-lama-engine-adoption.md) — full ADR (§6 = parity gates; §9 = outstanding items, now resolved)
- [DECISIONS.md D26](../DECISIONS.md#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20) — adoption decision
- [phase-6-engine-migration.md](../plan/phase-6-engine-migration.md) — execution plan
- [climate-lama-engine v0.4.0 PyPI page](https://pypi.org/project/climate-lama-engine/) — public API source of truth
- Notebook source: `../climate-lama-engine/notebooks/08_climada_comparison.ipynb` (commit `a30a6e4`)
