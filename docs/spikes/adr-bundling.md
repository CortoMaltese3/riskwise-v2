# ADR — Python Bundling: Nuitka vs PyInstaller on Stripped CLIMADA Env (Spike, Phase 0)

**Status:** Design accepted — empirical results pending Windows runner.
**Date:** 2026-04-18
**Issue:** #3
**Depends on:** DECISIONS.md D05 (engine track A/B/C), D02 (FastAPI loopback), D09 (offline installer variants), D16 (FastAPI + uvicorn verified on Windows)
**Cross-reference:** #4 (`climate_lama_engine` hazard-coverage spike — Track B)
**Informs:** Phase 4 Area 4 (lean backend execution), Area 15 (release workflow)
**Related architecture:** ARCHITECTURE.md § Area 4, § Verification Criteria (Phase 0)

---

## 1. Scope and outcome

Produce the dependency spec and the build / measurement plan for two candidate
Python bundlers on the stripped CLIMADA environment:

1. **Nuitka** — primary; compiles to C/C++. Selected in D05 as the default for
   Track A based on the 2–4× startup advantage vs PyInstaller reported for
   SciPy-stack apps.
2. **PyInstaller** — fallback; retained because the v1 build-chain uses it and
   we need a comparison baseline to confirm the Nuitka advantage on _our_
   dependency graph, not on a generic benchmark.

This document ships the **design artefacts**:

- [pyproject.toml](../../pyproject.toml) — canonical v2 Python spec, restricted
  to the 14 kept packages (§2).
- Build command matrix for both bundlers (§3).
- Measurement protocol (§4) and decision gates (§5).
- Recommendation framework cross-referenced with the Track B spike (§6).

The **empirical artefacts** — bundle size, cold-start, runtime delta — are
deferred to a Windows build host (§7). The numbers tables below are scaffolded
with the exact fields that must be filled in; leaving them `TBD` is deliberate
so the ADR tracks exactly one unfinished item and nothing else.

Track C (remote compute) is out of scope per D05 — offline is a hard
requirement (D09) and the 2-hour airport-wifi use case rules out a network
dependency on the hot path.

---

## 2. Dependency baseline

### 2.1 Kept (14 packages)

| Package | Role | Why it stays |
|---|---|---|
| `climada==4.1.1` | Core compute | Entire risk-assessment pipeline; pinned to v1's version so baseline scenarios are byte-reproducible. |
| `geopandas` | GIS dataframes | Exposure / admin-boundary handling. |
| `numpy`, `pandas` | Arrays / dataframes | CLIMADA transitive but listed explicitly so a lockfile audit is readable. |
| `shapely` | Geometry | Admin boundary ops; transitive from geopandas but pinned explicitly. |
| `pycountry` | ISO3 ↔ name | Country selection UI mapping. |
| `openpyxl`, `xlsxwriter` | Excel read / write | Entity files (read) and scenario export (write). |
| `pyarrow` | Parquet | DuckDB analytical storage (D03) + efficient dataframe interchange. |
| `h5py` | HDF5 | Drought / heatwave hazard files in `data/hazards/*.h5`. |
| `rasterio` | GeoTIFF | Flood hazard rasters in `data/hazards/*.tif`. |
| `duckdb` | Embedded DB | Scenario metadata, results cache, CRED data (D03, D13). |
| `fastapi` | HTTP surface | Loopback engine (D02, D16). |
| `uvicorn[standard]` | ASGI server | Hosts FastAPI; `standard` extras pull in `httptools` + `uvloop` (or winloop equivalent). |

Version ranges in `pyproject.toml` are deliberately permissive except for
CLIMADA, which is hard-pinned at `4.1.1` so reproducing v1 output during the
lama-engine comparison (#4) stays deterministic.

### 2.2 Removed (13 packages, ~200 MB of the v1 env)

| Package | Replaced by | Rationale |
|---|---|---|
| `matplotlib` | Chart.js in React | D06 — all charts rendered in frontend. Kills the largest single dep (~30 MB incl. fonts). |
| `Flask`, `Flask-CORS`, `Flask-SocketIO`, `Werkzeug` | FastAPI + uvicorn | D02 — HTTP + SSE on loopback; Flask had no SSE, no request-ID correlation. |
| `Selenium` | — | Unused in v1 runtime; legacy test tool. |
| `folium`, `cartopy` | Leaflet + MUI | All map rendering moved to Electron-side Leaflet; Python no longer emits map HTML. |
| `geocoder` | — | Never used on the runtime path; country selection is ISO3-driven. |
| `ipykernel` | — | Jupyter-only, not a runtime dep. `backend/dev.ipynb` stays in-repo but runs against the dev env, not the bundled one. |
| `python-docx`, `docxtpl`, `docx2pdf` | Electron `printToPDF()` | D10 — report generation moves to frontend; removes the MS Word runtime requirement. |

### 2.3 Not listed in issue but worth flagging

- `setuptools`, `wheel` — build-time only, not runtime; declared in
  `[build-system]` rather than `[project.dependencies]`.
- `pywin32` / `pywin` — Windows-only utility. v1 pulled `pywin==0.3.1` which
  is the wrong package (`pywin` on PyPI is an unrelated abandoned stub);
  v2 drops it outright. If a CLIMADA transitive needs `pywin32` on Windows
  it is pulled automatically via the climada dist's environment markers.
- `scipy`, `gdal`, `fiona` — transitive through CLIMADA / rasterio /
  geopandas; not listed in `[project.dependencies]` to keep the direct-dep
  list readable. The bundler pulls them automatically.

---

## 3. Build command matrix

All commands assume a clean virtualenv / conda env populated from
`pyproject.toml` with the `bundle` extra, and are run on Windows 11
x64 with Python 3.11 unless stated otherwise.

### 3.1 Entry point

The bundled executable is a thin launcher equivalent to today's
`backend/app.py`: it starts the FastAPI app on `127.0.0.1:0` and emits the
ready event described in D16. The bundler's `--onefile` / `--standalone`
mode wraps this entry point.

```python
# backend/__main__.py (to be added in Phase 1; referenced here for the spike).
from backend.app import main
if __name__ == "__main__":
    main()
```

### 3.2 Nuitka (primary)

```powershell
python -m nuitka `
  --standalone `
  --onefile `
  --python-flag=no_site `
  --assume-yes-for-downloads `
  --enable-plugin=numpy `
  --enable-plugin=pylint-warnings `
  --include-package=climada `
  --include-package=rasterio `
  --include-package=fiona `
  --include-package=pyproj `
  --include-package-data=climada `
  --include-package-data=rasterio `
  --include-package-data=pyproj `
  --include-package-data=shapely `
  --nofollow-import-to=matplotlib `
  --nofollow-import-to=tkinter `
  --nofollow-import-to=IPython `
  --nofollow-import-to=notebook `
  --output-dir=dist/nuitka `
  --output-filename=riskwise-engine.exe `
  --company-name="RISK WISE" `
  --product-name="RISK WISE Engine" `
  --file-version=2.0.0.0 `
  --product-version=2.0.0.0 `
  backend/__main__.py
```

Notes:

- `--enable-plugin=numpy` is mandatory on 2.x Nuitka for SciPy-family packages.
- `--include-package-data` is what catches CLIMADA's shipped `.hdf5` /
  `.json` assets, GDAL/PROJ data directories, and Shapely's `.dll`s.
- `--nofollow-import-to` sanity checks that the removed packages really
  are not pulled through a transitive `try: import matplotlib` branch.
  Any violation here is a spec-vs-reality bug that must be fixed in
  backend code, not papered over in the bundler config.
- We deliberately **do not** set `--lto=yes`. LTO roughly doubles build
  time for a marginal runtime win on SciPy-stack code; the engine already
  pays most of its cost inside compiled NumPy / rasterio kernels.

### 3.3 PyInstaller (fallback / baseline)

```powershell
pyinstaller `
  --onedir `
  --name riskwise-engine `
  --distpath dist/pyinstaller `
  --workpath build/pyinstaller `
  --specpath build/pyinstaller `
  --collect-submodules climada `
  --collect-data climada `
  --collect-data rasterio `
  --collect-data pyproj `
  --collect-data shapely `
  --exclude-module matplotlib `
  --exclude-module tkinter `
  --exclude-module IPython `
  --exclude-module notebook `
  --exclude-module PyQt5 `
  --exclude-module PyQt6 `
  --noconfirm `
  backend/__main__.py
```

Notes:

- `--onedir` is chosen over `--onefile` because CLIMADA's cold-start on
  `--onefile` includes a multi-second temp-extract step; `--onedir` is a
  fair apples-to-apples comparison against Nuitka `--standalone`.
- `--collect-submodules climada` is the PyInstaller equivalent of
  Nuitka's `--include-package=climada` and is necessary because CLIMADA
  uses dynamic `importlib` calls that the static analyser misses.
- `--exclude-module PyQt*` kills a 60 MB false positive pulled in via
  matplotlib transitives even with matplotlib already removed at the
  pyproject level, on some rasterio builds.

### 3.4 Reproducibility knob

Both builds run inside a locked env produced by:

```powershell
uv pip compile pyproject.toml --extra bundle --output-file requirements.lock.txt
uv pip sync requirements.lock.txt
```

The `requirements.lock.txt` is **not** committed in this spike (it
belongs to Phase 4 Area 4). Recording the exact lock hash in the
measurement table (§4) is what makes a given row reproducible.

---

## 4. Measurement protocol

Each row in the results table is produced by the same script, run against the
same data, on the same hardware. This is the minimum needed for the numbers
to mean anything.

### 4.1 Reference hardware

| Field | Target |
|---|---|
| OS | Windows 11 Pro 23H2, x64 |
| CPU | ≥ 8 logical cores, baseline 2.5 GHz |
| RAM | ≥ 16 GB |
| Disk | NVMe SSD; warm cache for the second run of each measurement |
| Python | 3.11.x (match CLIMADA 4.1.1's tested matrix) |

Ideally the GitHub Actions `windows-latest` runner, so the measurement can be
re-run in CI on every Phase 4 change. A physical dev box is acceptable if the
CPU/RAM/disk profile is documented in the row.

### 4.2 Reference scenario

Egypt flood ERA scenario, run end-to-end, same inputs as issue #22 (CLIMADA
baseline capture). Inputs:

- Entity: `data/entities/<EGY-flood ERA entity>.xlsx`
- Hazard: `data/hazards/<EGY flood hazard>.tif`
- Adaptation measures: `requirements/adaptation_measures.xlsx` (default set)
- Return periods: 10 / 50 / 100 / 250

### 4.3 What is measured

| Metric | Definition | Tool |
|---|---|---|
| Bundle size (MB) | `du -sm dist/<bundler>/` after build; single number per bundler. | `Get-ChildItem \| Measure-Object -Sum` |
| Cold startup (s) | Wall-clock from process spawn to `{"type":"event","name":"ready"}` on stdout. First run after reboot; discard warm-cache run. | `Measure-Command` |
| Scenario runtime (s) | Wall-clock from `POST /scenario/run` to the final SSE `done` event. Median of 5 runs. | The server's own timing + client stopwatch. |
| Runtime delta (%) | `(bundled_runtime − unbundled_runtime) / unbundled_runtime × 100`. Positive = bundled is slower. | Computed from the previous two rows. |
| Peak RSS (MB) | Windows Performance Monitor, peak working set during scenario runtime. | PerfMon, optional row. |

Accuracy: no attempt to isolate noise below ±2 %. Anything smaller than that
should not drive a decision.

### 4.4 Results table (to be filled in — all TBD)

| Config | Bundle size (MB) | Cold start (s) | Scenario (s) | Δ vs unbundled | Notes |
|---|---|---|---|---|---|
| Unbundled (venv + pyproject) | — | TBD | TBD | 0 % (baseline) | Reference row. |
| Nuitka `--onefile` | TBD | TBD | TBD | TBD | Primary candidate per D05. |
| Nuitka `--standalone` (onedir) | TBD | TBD | TBD | TBD | Onedir for fair compare vs PyInstaller. |
| PyInstaller `--onedir` | TBD | TBD | TBD | TBD | Fallback / baseline. |
| PyInstaller `--onefile` | TBD | TBD | TBD | TBD | Optional; documents the temp-extract cost. |

Each row above is a rendering of a single measurement row produced by
`scripts/measure_engine.ps1`. The underlying JSON schema — which CI
captures as a workflow artefact and which the maintainer pastes into the
table above once collected — is:

```json
{
  "bundler": "nuitka | pyinstaller | unbundled",
  "bundle_size_mb": 0.0,
  "cold_start_ms": 0.0,
  "scenario_runtime_s": 0.0,
  "runtime_delta_pct": 0.0,
  "python_version": "Python 3.11.x",
  "os_build": "Microsoft Windows … 10.0.22631",
  "lock_hash": "<sha256 of the resolved lock file used for the build>"
}
```

The `python_version`, `os_build`, and `lock_hash` fields are the
per-row reproducibility footnote called out earlier in this section —
record them alongside each filled cell (e.g. under the table as a
footnote block, keyed by the row). CPU model is not captured by the
JSON schema because the reference hardware in §4.1 and
[`docs/reference/benchmarks.md`](../reference/benchmarks.md) already pins it; only rows taken
on a different box need a CPU-model override in the footnote.

---

## 5. Decision gates

Nuitka wins (keeps default Track A) if **all** of:

1. Bundle size ≤ 900 MB (offline installer budget per D09 / D05 threshold 5).
2. Cold start ≤ 2× unbundled, absolute ≤ 10 s.
3. Scenario runtime within ±5 % of unbundled on the Egypt flood scenario.
4. Runnable `.exe` emitted without post-build patching beyond the documented
   flags in §3.2.

Fall back to PyInstaller if Nuitka fails any of the above and PyInstaller
passes all of (1)–(3) with its equivalent thresholds:

- PyInstaller bundle size ≤ 900 MB.
- PyInstaller cold start ≤ 15 s (PyInstaller is a priori slower; this is the
  generous threshold).
- PyInstaller runtime within ±5 % of unbundled.

If **both** bundlers fail (1)–(3), Track A is not viable at current CLIMADA
scope, which escalates the decision back to Track B regardless of the lama
engine spike's own outcome. Record that escalation explicitly in the
filled-in table row.

"Runs end-to-end" is not a threshold — it is a precondition. A bundle that
does not complete the Egypt flood scenario is not a row in the table; it is
a build failure and goes in §7 (outstanding) with the exact error.

---

## 6. Cross-reference with `climate_lama_engine` (Track B)

The issue requires a recommendation cross-referenced with the #4 spike. The
final engine selection is the join of two spikes; this ADR owns **one column**
of the decision matrix.

| Outcome of #4 (Track B) | Outcome of this ADR (Track A) | Selected track |
|---|---|---|
| Track B passes all 5 D05 criteria | Irrelevant | **Track B.** Bundle is ~50 MB; no bundler argument survives. |
| Track B fails any D05 criterion | Nuitka passes §5 gates | **Track A — Nuitka.** Default of record. |
| Track B fails any D05 criterion | Nuitka fails, PyInstaller passes §5 gates | **Track A — PyInstaller.** Rewrite Phase 4 build step but keep Track A. |
| Track B fails any D05 criterion | Both bundlers fail §5 gates | **Escalate.** Options: (a) drop a hazard from v2 scope to pass Track B, (b) revisit Track C with online-only degraded mode, (c) fund Nuitka enterprise / commercial support to debug the bundler failure. Decision belongs to the maintainer + GIZ, not to this spike. |

The lama engine spike writes the matching row from its side in
`docs/spikes/adr-lama-engine.md`. Both ADRs must agree on
their corner of this table before Phase 4 Area 4 executes.

---

## 7. Outstanding work

This spike has **one** unfinished item. Everything else in the design is
decided.

- [ ] Run §3 build commands on a Windows 11 runner (CI or physical box).
      Fill in §4.4 table. Update §6 with the selected track. Promote this
      ADR's status from "Design accepted" to "Accepted" and add the
      corresponding entry to `DECISIONS.md` (next free D-number).

Until that runner is available, Phase 4 Area 4 cannot commit to a bundler,
and the installer-size budget in D09 remains a target not a constraint.

---

## 8. Why this spike is design-only

The original issue acceptance criteria ask for a runnable `.exe` and
measured numbers. Producing a Windows `.exe` requires a Windows host;
the maintainer's primary dev environment is WSL2 Linux. Building Linux
binaries instead would give numbers that do not transfer — Nuitka's C
toolchain, PyInstaller's binary-collection behaviour, and CLIMADA's
native extensions all differ between Linux ELF and Windows PE targets.

Options considered at kickoff of this issue:

1. **Linux-side spike** (produce `.so`-linked binaries on WSL, report
   those numbers). Rejected: numbers do not apply to the Windows
   installer the product actually ships.
2. **Design-only ADR** (this document). Selected: freezes the dependency
   baseline, build commands, and decision gates now, so that whoever
   runs the measurements on a Windows runner has no design choices left
   to make and the spike closes on numbers alone.
3. **Defer until Windows access.** Rejected: the dependency baseline and
   decision framework are load-bearing for #4 and Phase 1 planning, and
   should not wait on runner provisioning.

When the Windows measurements are available, the outstanding item in §7
closes without re-litigating §2, §3, §5, or §6.
