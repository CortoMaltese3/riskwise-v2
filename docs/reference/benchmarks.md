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
| Online installer size | ≤ 150 MB | Engine downloaded post-install. |
| Offline installer size | ≤ 900 MB | Engine + EGY/THA tile pack + hazard data. |
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
| Online installer size | ≤ 150 MB | 293.1 MB | Windows 11 local `npm run dist` | defer | `data/` (175 MB ERA scenarios) bundled in violation of Phase 4 Area 14 design — should be downloaded on first launch. Stripping `data/` from `electron-builder.cjs#files` would put the installer at ~125 MB. First-launch data download tracked in #172; re-measure once that lands. |
| Offline installer size | ≤ 900 MB | n/a — variant deferred | — | defer | Offline installer variant deferred per [DECISIONS.md D24](../DECISIONS.md#d24--air-gapped-deployment-support-deferred-until-named-customer); tracked in #134. Re-measure once the variant lands. |
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
