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
