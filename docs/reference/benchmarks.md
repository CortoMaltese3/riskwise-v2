# Performance Benchmarks

Where RISK WISE v2's measurable performance targets live, plus the reference
hardware they are measured against. The Phase 0 bundler spike
([`adr-bundling.md`](../spikes/adr-bundling.md)) fills the
bundler-specific rows; every subsequent release gates on the same table.

A target is binding only when it appears here. "Significantly smaller"
and similar prose do not count.

## Targets

Source: [`ARCHITECTURE.md § Performance Benchmark Targets`](../ARCHITECTURE.md#performance-benchmark-targets).

| Metric | Target | Notes |
|---|---|---|
| Single installer size | retired — see [D25](../DECISIONS.md#d25--single-bundled-installer-for-v20-retire-two-variant-split) | Single bundled NSIS installer (ERA datasets bundled, engine downloaded on first launch). Replacement target to be set after Phase 6 (`climate-lama-engine`) lands. |
| App cold-start to ready | ≤ 5 s | From double-click to health endpoint responding. |
| Egypt flood ERA scenario | ≤ 90 s | End-to-end on reference hardware. |
| Thailand heatwave ERA scenario | ≤ 120 s | Larger raster. |
| Scenario restore from DuckDB | ≤ 1 s | Query only, no recomputation. |
| CRED chart render | ≤ 500 ms | Data fetch + Chart.js render. |

## Reference hardware

All targets above assume a single reference machine. When a measurement is
taken on a different box, the row must record the deviation explicitly —
otherwise two rows in the same table describe two different experiments.

| Field | Spec |
|---|---|
| OS | Windows 11 Pro 23H2, x64 |
| CPU | Intel i5 (4 cores), baseline 2.5 GHz |
| RAM | 16 GB |
| Disk | SSD (SATA or NVMe) |
| Python | 3.11.x (matches CLIMADA 4.1.1 / 6.1.0 tested matrix) |

GitHub Actions `windows-latest` runners are a close-enough proxy for the
CI-driven measurements in `adr-bundling.md §4`; a physical dev box with
the above profile is the fallback when a CI runner is not available.

## Measurement protocol

- **Bundle size**: `Get-ChildItem | Measure-Object -Sum` on the bundler's
  `dist/` output. Report MB to two decimal places.
- **Cold start**: wall-clock from process spawn to the engine's
  `{"type":"event","name":"ready","port":N}` line on stdout. First run
  after reboot; discard the warm-cache run.
- **Scenario runtime**: wall-clock from `POST /api/v1/scenario/run` to the
  final SSE terminal event (`result`, `cancelled`, or `error`). Median of
  five runs. The automation is `scripts/measure_engine.ps1`.
- **Runtime delta %**: `(bundled − unbundled) / unbundled × 100`. Positive
  = bundled is slower. Record the unbundled baseline in the same row's
  footnote so each row is self-contained.

Accuracy floor: ±2 %. Anything tighter than that is noise — do not let it
drive a decision.

## v2.0.0 release measurements

Issue #123 is the final pre-release sweep. Every target above is recorded
here against either a measured value on reference hardware or the
GitHub Actions `windows-latest` runner used by `tests.yml` and the
release CI pipeline.

If a target does not pass, the row carries the measured value, a
root-cause line, and an explicit decision: **accept** (within tolerance
or non-blocking), **defer** (tracked for a v2.0.x patch), or **fix
now** (release-blocker, must land before tag).

| Metric | Target | Measured | Hardware | Decision | Notes |
|---|---|---|---|---|---|
| Single installer size | retired — see [D25](../DECISIONS.md#d25--single-bundled-installer-for-v20-retire-two-variant-split) | 293.1 MB | Windows 11 local `npm run dist` | accept | Single bundled NSIS installer (ERA datasets bundled, engine downloaded on first launch). Two-variant `Online ≤ 150 MB` / `Offline ≤ 900 MB` split retired per D25. Replacement target to be set after Phase 6 (`climate-lama-engine`) lands. ERA-data compression (XLSX → DuckDB) is tracked separately as a v2.1+ optimization. The all-in-one offline variant remains deferred per [D24](../DECISIONS.md#d24--air-gapped-deployment-support-deferred-until-named-customer) (#134). |
| App cold-start to ready | ≤ 5 s | _pending — measure on reference hardware_ | reference dev box | — | Wall-clock from process spawn to engine `ready` event (see Measurement protocol). First run after reboot. |
| Egypt flood ERA scenario | ≤ 90 s | _pending — measure on reference hardware_ | reference dev box | — | Median of five runs via `scripts/measure_engine.ps1`. |
| Thailand heatwave ERA scenario | ≤ 120 s | _pending — measure on reference hardware_ | reference dev box | — | Larger raster than Egypt flood. |
| Scenario restore from DuckDB | ≤ 1 s | _pending — measure on reference hardware_ | reference dev box | — | Query only, no recomputation. |
| CRED chart render | ≤ 500 ms | _pending — measure on reference hardware_ | reference dev box | — | Data fetch + Chart.js render. |

The "_pending_" rows are placeholders pending the dedicated measurement
session against a clean Windows 11 install of the v2.0.0 candidate
build on the reference hardware listed above. Issue #123 unblocks the
v2.0.0 release once each row is populated; rows that miss their target
move from "_pending_" to a `defer` or `fix now` decision before the
release is tagged.

## v2.x — Engine-path bundle measurements (issue #165)

Measured 2026-05-03. Environment: Windows 11 Pro 10.0.26200, Python 3.11.12,
`climada_env` conda env. Lean builds exclude CLIMADA package import
(`--exclude-module climada` / no `--include-package=climada`).
`lock_hash: 7fd36d02ae0317a8a13d0c5d06589629c3ae23159188eaa4a5658c963428530b`.

| Config | Bundle (MB) | Cold start (s) | Scenario (s) | Δ vs unbundled | Decision |
|---|---|---|---|---|---|
| Unbundled (engine path) | — | < 1 s | ~3.5 s | 0 % | Baseline |
| Nuitka `--standalone` lean | 1 634 | 5.6 | 0.76 | −78 %¹ | **Deferred** — fails size gate (> 900 MB); re-measure from clean engine-only venv |
| PyInstaller `--onedir` lean | 1 289 | 5.2 | 0.75 | −78 %¹ | **Deferred** — fails size gate; re-measure from clean engine-only venv |
| Nuitka `--onefile` lean | — | — | — | — | **Skipped** — zstd OOM on build host; deferred to clean-env rebuild |

¹ Negative delta reflects warm OS file cache on bundled runs, not genuine speedup.
Cold start passes the ≤ 10 s gate; runtime shows no regression.

**Finding:** `--exclude-module climada` does not unwind CLIMADA's transitive
dep graph (`climada_env`). Top bloat: llvmlite 87 MB, pyarrow 77 MB, eccodes
37 MB, babel 29 MB, bokeh 21 MB, sklearn 14 MB. Reaching the 150–250 MB target
requires bundling from a clean engine-only venv post engine-path consolidation.

CI cannot fully substitute for the dev-box runs:

- Bundle-size rows can be measured on `windows-latest` against the
  `release-please` artifact and copied into this table verbatim.
- Cold-start and scenario-runtime rows depend on local SSD + 4-core CPU
  characteristics that GitHub-hosted runners do not match closely
  enough for the ±2 % accuracy floor; record those rows from the
  reference dev box.
- The chart-render row is browser-render-bound; measure in the
  packaged Electron app, not in vitest, since `jsdom` does not exercise
  the Chart.js raster path.
