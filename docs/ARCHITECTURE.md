# RISK WISE v2 — Architecture & Roadmap

> **Purpose of this document**: Seed context for any conversation or contributor picking up v2 work. It describes what RISK WISE is, what v1 looks like today, the full v2 design rationale, and a phased implementation roadmap. Read this before touching any code.

---

## What is RISK WISE?

RISK WISE is a desktop GUI application wrapping [CLIMADA](https://climada-python.readthedocs.io/), a fully probabilistic climate risk assessment library. Built for GIZ/UNU-EHS (UN University for Environment and Human Security), it lets policy officers and analysts select a country, hazard type, exposure category, and climate scenario, then run end-to-end risk assessment with cost-benefit analysis of adaptation measures.

**Current capabilities**: Egypt and Thailand, flood / drought / heatwave hazards, ERA (ERA5-based) and custom data modes.

**Target users**: Government analysts, climate risk researchers, NGO project officers — often in restricted network environments.

**v1 public repo**: `https://github.com/gkalomalos/ERA-Project_RISK-WISE` (frozen at v1.0.8)
**v2 private repo**: `https://github.com/CortoMaltese3/riskwise-v2` (active development)

---

## Repository Strategy

v2 is developed in a **fresh private repo** cloned from v1.0.8. This is intentional:

- The client (GIZ/UNU-EHS) transferred GitHub ownership to the maintainer due to lack of devops capacity, but IP ownership is governed by contract — not GitHub ownership.
- v2 work is speculative/proprietary until the client commits to adoption. All v2 work stays in the private repo.
- Public repo receives only v1 bug fixes until a commercial decision is made.
- If the client adopts v2: transfer the private repo or merge into public under agreed terms.
- If declined: v2 stays private for other uses.

**Do not** use a GitHub fork — fork networks are discoverable even for private forks.

---

## Current Application Layout (v1 Tab Tour)

A cold-start reader needs this to understand what the product actually does before touching any code.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header bar: logo · language picker (EN/AR/TH) · app-option selector  │
├──────────────────────────────────────────────────────────────────────┤
│ Tab 0 – Home / Overview                                              │
│   Landing screen; no interaction required.                           │
├──────────────────────────────────────────────────────────────────────┤
│ Tab 1 – Risk Assessment (main workflow)                              │
│  ┌─────────────────┐ ┌──────────────────────────────┐ ┌───────────┐ │
│  │ DataInput (left)│ │ MainView (map / chart)        │ │ Results   │ │
│  │ 2/12 cols       │ │ 8–10/12 cols                  │ │ (right)   │ │
│  │                 │ │ activeViewControl drives:     │ │ 2/12 cols │ │
│  │ Cards:          │ │   display_map                 │ │           │ │
│  │  country        │ │   display_hazard_chart        │ │ Impact    │ │
│  │  hazard         │ │   display_exposure_chart      │ │ summary   │ │
│  │  scenario       │ │   display_impact_chart        │ │ waterfall │ │
│  │  time horizon   │ │   display_cost_benefit        │ │ costben   │ │
│  │  exposure econ  │ │                               │ │ data      │ │
│  │  exposure non-  │ │ activeMap controls Leaflet    │ │           │ │
│  │  economic       │ │ layer: hazard/exposure/impact │ │           │ │
│  │                 │ │                               │ │           │ │
│  │ [Run Scenario]  │ │                               │ │           │ │
│  └─────────────────┘ └──────────────────────────────┘ └───────────┘ │
│  Sub-tabs below MainView: Map | Hazard | Exposure | Impact | CostBen │
├──────────────────────────────────────────────────────────────────────┤
│ Tab 2 – Macroeconomic Analysis (CRED pipeline)                       │
│   Country → Scenario → Variable → Sector → [Plot Chart]             │
│   Reads pre-computed CRED data from requirements/cred_output.xlsx    │
│   Shows timeseries with/without adaptation                           │
├──────────────────────────────────────────────────────────────────────┤
│ Tab 3 – Reports (workspace)                                          │
│   List of completed scenario runs stored in file system (v1)         │
│   Actions: view, export (Excel / Word / PDF), delete                 │
└──────────────────────────────────────────────────────────────────────┘
```

**App-option modes** (selector in header, persisted in store as `selectedAppOption`):
- `"era"` — ERA project mode: entity files, hazard files, and validation all use pre-shipped data; validation flags are force-set to `true`.
- `""` (custom) — user supplies own entity/hazard files or pulls from CLIMADA Client API.

---

## Data-Seed vs User-Data Model

Two independent directory trees. Never mix them.

| Tree | Location | Who owns it | Changes when |
|------|----------|-------------|--------------|
| **Seed data** | `data/` and `requirements/` inside the installed app | Maintainer / installer | App update only |
| **User data** | `%APPDATA%/RISK WISE/` (Windows); env `RISKWISE_USER_DATA` | User | Every run |

**Seed data** (immutable at runtime):
```
data/entities/     29 xlsx files (EGY+THA × FL/HW/D × exposure types)
data/hazards/      15 files (.h5 HDF5 for drought/heatwave, .tif for flood)
data/manifest.json SHA-256 registry, verified on startup (planned v2)
requirements/
  adaptation_measures.xlsx  built-in adaptation measure catalogue
  cred_output.xlsx          pre-computed CRED macroeconomic timeseries
  gadm0/1/2 *.geojson       GADM admin boundaries for EGY + THA
  report_template.docx      Word report template (being removed in v2)
  report_data.json          report metadata
```

**User data** (persistent, survives updates):
```
%APPDATA%/RISK WISE/
  data/temp/       active scenario working files (cleared on new run in v1)
  data/reports/    saved scenario outputs
  logs/            rolling log files
  riskwise.db      DuckDB database (v2 — replaces temp+reports dirs)
  user-data/       custom countries, measures, hazards (v2 Area 22)
  cred/            user-uploaded CRED xlsx files (v2 Area 23)
```

`electron.js` passes the user-data root as `RISKWISE_USER_DATA` env var to the Python subprocess. `backend/constants.py:get_user_data_dir()` reads it.

---

## Network Calls Inventory

Every outbound call categorized. This drives the offline-mode audit (Area 14).

| Call | Initiator | Category | Offline behaviour |
|------|-----------|----------|-------------------|
| Leaflet tile requests | Frontend (Leaflet) | Enhancement | Switch to cached MBTiles pack |
| CLIMADA Client API (entity/hazard download) | Python backend | Enhancement | Block; show "unavailable offline" |
| GitHub Releases API (update check) | Electron main | Enhancement | Skip entirely |
| Engine ZIP download | Electron main / installer | Lifecycle | Skip; show "engine update pending" |
| engine-manifest.json fetch | Electron main | Lifecycle | Skip |
| Sentry crash reports | Frontend + Electron | Optional/telemetry | Block in offline mode |
| Inter font (Google Fonts CDN) | Frontend | Enhancement | Bundle font locally |

All "Enhancement" and "Optional" calls must be behind the offline-mode guard added in Area 14. "Lifecycle" calls skip gracefully; they never block app launch.

---

## Current Architecture (v1)

```
[React 18 + MUI 5 + Leaflet + Chart.js]   (72 components, Zustand store)
              |
     [Electron 37.3.1 Main Process]         (824-line electron.js)
              |  JSON over stdin/stdout
     [Python 3.11 Subprocess]               (app.py dispatcher — 125 lines)
              |
     [CLIMADA 4.1.1 + GeoPandas + NumPy]   (scientific computation)
              |
     [File System]                          (.xlsx, .h5, .tif, .geojson, .parquet, .png)
```

### Key v1 Pain Points

| Area | Problem |
|------|---------|
| IPC | stdin/stdout JSON, no request IDs, no timeout, no cancellation |
| Errors | `console.log(error)` everywhere, no user notification, Python crash = app dead |
| Styling | 30+ hardcoded hex colors, no MUI theme, no design tokens |
| Charts | Waterfall + cost-benefit rendered as static PNG by matplotlib |
| Backend | `run_scenario.py` (805 lines), two near-identical ERA/custom paths |
| Scenario management | Folder-copy save/restore, temp dir cleared on new run, no comparison |
| Reports | Require MS Word for PDF export |
| Distribution | ~500MB conda env, unsigned installer, SmartScreen warnings |
| Tests | Broken imports, never run, no CI gate |

---

## Target Architecture (v2)

```
[React 18 + MUI 7 Design System + Leaflet + Chart.js]
   |  ThemeProvider, Inter font, animations, sidebar nav
   |
[Electron Main Process]   (process supervisor, health monitor, update manager)
   |  HTTP on 127.0.0.1 (loopback) + SSE for progress streaming
   |
[FastAPI + uvicorn]       (typed Pydantic endpoints, async, request-ID correlation)
   |
[CLIMADA or climate_lama_engine]   (pluggable, caching, parallel GeoJSON)
   |
[DuckDB (embedded)]  +  [Files for .h5, .tif, .xlsx, .geojson]
```

### Why loopback HTTP is safe in restricted environments

`127.0.0.1` is kernel-level IPC — it never touches a network interface. Enterprise firewalls target external interfaces. If loopback were blocked, VS Code, Docker, and most database clients would break. We bind exclusively to `127.0.0.1:0` (OS-assigned port), printed once to stdout on startup.

---

## Proposed Architecture Areas

### Area 1 — Backend Communication: FastAPI on Loopback (CRITICAL)

Replace stdin/stdout with HTTP + SSE.

**Startup flow**: Electron spawns Python → uvicorn binds `127.0.0.1:0` → Python prints `{"type":"event","name":"ready","port":XXXX}` → Electron reads port → all further comms via HTTP.

**REST API**:
```
POST   /api/v1/scenario/run
GET    /api/v1/scenario/{job_id}/stream    ← SSE progress + result
POST   /api/v1/data/validate
GET    /api/v1/measures/{country}/{hazard}
GET    /api/v1/scenarios
GET    /api/v1/scenarios/{id}
POST   /api/v1/scenarios/{id}/export
DELETE /api/v1/scenarios/{id}
GET    /api/v1/macro/cred-output
POST   /api/v1/macro/chart-data
GET    /api/v1/countries
GET    /api/v1/health
```

**Files**: `backend/app.py` (rewrite), `build/electron.js`, `src/APIService.js`

---

### Area 2 — Error Handling & Resilience (CRITICAL)

- Process supervisor: Electron polls `/health`, auto-restarts Python with exponential backoff (max 3 attempts)
- Job isolation: scenario computations in background thread — CLIMADA crash doesn't kill FastAPI
- Structured errors: `{status, code, message, detail}` from backend; typed errors in frontend (see Error-Code Taxonomy section)
- Zustand `error`/`errorMessage` fields; React ErrorBoundary; toast notifications
- Warn user before clearing unsaved work

**Cancellation semantics**: CLIMADA calls cannot be interrupted mid-computation (no cooperative checkpoint). Define the contract explicitly: frontend sends `DELETE /api/v1/scenario/{job_id}`; backend sets a cancel flag polled between major CLIMADA steps (Entity load → Hazard load → Impact calc → CostBen); SSE stream closes with `{"type":"cancelled"}`; Python thread is joined with a timeout, then process-level termination if unresponsive. Document which steps are cancellable and which must run to completion.

**CLIMADA thread-safety**: CLIMADA + NumPy globals are not fully thread-safe. Guarantee one active scenario job at a time via a `asyncio.Lock` in FastAPI (queue subsequent requests, don't reject). Document this single-job constraint explicitly; do not attempt a multi-job process pool until it is proven necessary and tested.

**Memory pressure**: v1 README notes an 8 GB floor for in-memory pandas. Add a pre-flight memory estimate check: if `psutil.virtual_memory().available` < projected peak, return a structured error before starting computation. For large raster hazard files, validate tile size before loading; stream/chunk where CLIMADA supports it. No graceful OOM recovery mid-computation — fail fast with a clear error.

**Files**: `build/electron.js`, `src/APIService.js`, `src/store.js`, backend handlers

---

### Area 3 — Data Layer: DuckDB (HIGH)

Replace file-based scenario storage with DuckDB embedded database.

```sql
schema_version (version INTEGER, applied_at TIMESTAMP)
-- Migration runner checks this on every startup; applies pending migrations in order.
-- Breaking schema changes bump version; migration scripts live in backend/db/migrations/.

scenarios (id, name TEXT, tags TEXT, notes TEXT,
           country, hazard_type, scenario, exposure_type, asset_type,
           ref_year, future_year, annual_growth, is_era, app_option, status, created_at)
-- name/tags/notes: user-facing annotation (see Area 11 and Scenario Naming section)

scenario_results (scenario_id, result_type, data BLOB, created_at)
-- result_type: 'hazard_geojson', 'exposure_geojson', 'impact_geojson',
--              'waterfall_data', 'costben_data', 'impact_summary'

computation_cache (cache_key, result_type, data BLOB, created_at)

snapshots (id, scenario_id, snapshot_type, image BLOB, created_at)

cred_datasets (id, name TEXT, source TEXT, uploaded_at TIMESTAMP, is_builtin BOOLEAN)
-- Points to either built-in cred_output.xlsx or a user-uploaded file (Area 23)
```

Files stay as-is: `.h5`/`.tif` hazard data, `.xlsx` entity defs, `.geojson` boundaries.

**Schema migrations**: Users will have scenarios saved in v2.0.0 format; a v2.1 schema change must not silently break them. On startup, compare `schema_version` to current expected version; run `backend/db/migrations/NNNN_*.sql` in sequence. Ship v2 with migrations from day one — retrofitting is painful.

**Files**: New `backend/db/` module, `backend/db/migrations/`

---

### Area 4 — Python Environment: Lean Backend (HIGH)

Original v1 baseline: ~500MB conda env with unused packages (Flask, Selenium, folium, matplotlib, docx libs).

**Outcome (post-Phase-6)**: Track A (strip deps aggressively + Nuitka) shipped for v2.0; Track B (`climate-lama-engine`) shipped in Phase 6 and is now the default and only runtime compute backend. CLIMADA was removed from runtime deps in #166. See [DECISIONS.md D26](DECISIONS.md#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20) and [phase-6-engine-migration.md](plan/phase-6-engine-migration.md).

- **Track A** (shipped v2.0): strip deps aggressively + Nuitka bundler (compiles to C, 2-4x faster than PyInstaller).
- **Track B** (shipped Phase 6): `climate-lama-engine` (NumPy+SciPy only) replaces CLIMADA as the runtime compute layer; HDF5/GeoTIFF/XLSX file I/O lives in `backend/engine/loaders/` and a local catalog (`data/catalog.json` + `backend/engine/catalog.py`) replaces `climada.util.api_client.Client`.
- **Track C**: Remote backend (rejected — breaks offline use).

**Keep**: climate-lama-engine, geopandas, numpy, pandas, scipy, shapely, pycountry, openpyxl, pyarrow, h5py, rasterio, xlsxwriter, duckdb, fastapi, uvicorn, pyproj

**Removed**: climada (Phase 6 #166), matplotlib, Flask, Flask-CORS, Flask-SocketIO, Selenium, Werkzeug, folium, geocoder, ipykernel, cartopy, python-docx, docxtpl, docx2pdf

**Files**: `pyproject.toml`, `requirements/requirements.txt`, `requirements/environment.yml`, `backend/engine/`

---

### Area 5 — Typed API Contract (HIGH)

- Pydantic models for all request/response shapes
- FastAPI auto-generates OpenAPI schema
- `openapi-typescript` generates TypeScript types at build time
- New typed `RiskWiseClient` replaces `APIService.js`
- Frontend never references `.py` filenames

**Files**: `src/APIService.js` (rewrite), new Pydantic models in `backend/`

---

### Area 6 — Charts: All Visualization to Frontend (HIGH)

Move waterfall and cost-benefit charts from matplotlib PNG to interactive Chart.js in React.

Backend returns structured JSON; frontend renders. Removes matplotlib dependency (~30MB).

**Files**: `backend/costben/costben_handler.py` (return data, not PNG), new frontend chart components

---

### Area 7 — Backend Refactor (HIGH)

- Unify ERA/custom paths: single `run_scenario()` with strategy pattern for data loading
- Extract country configs to `countries/{ISO3}/config.json` + `impact_functions.json`
- Move duplicated `assign_levels()` to `base_handler`
- Refactor 661-line impact function if/elif chain into a registry loaded from config
- Dependency injection in handlers for testability

**ERA constants — must move to country configs**: `run_scenario.py:195-270` hardcodes Egypt discount rate (6.89%), Thailand discount rate (0.90%), per-sector growth rates, and `get_custom_rp_per_hazard()` return periods. These must move into `countries/EGY/config.json` and `countries/THA/config.json` with source citations (e.g. World Bank discount rate; return-period defaults inherited from the original CLIMADA event-set documentation). In ERA mode users adjust via entity xlsx upload; in custom mode expose fields in the UI so analysts can override without touching code.

**Engine adapter pattern (post-Phase-6)**: `backend/engine/adapter.py` is the single seam between riskwise and `climate-lama-engine`; every other backend module routes through that adapter so we have one fix point when the engine API drifts. Per [DECISIONS.md D26](DECISIONS.md#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20) and [adr-climate-lama-engine-adoption.md §5.1](spikes/adr-climate-lama-engine-adoption.md), the adapter is the only file in `backend/` allowed to import `climate_lama_engine.*`; the rule is enforced by `scripts/check_engine_imports.py` in CI.

**RequestData anti-pattern** (existing bug / tech debt): `run_scenario.py:39-76` defines `RequestData` as a dataclass that embeds `BaseHandler` and `HazardHandler` instances as fields — mixing a data-transfer object with service objects. Separate cleanly: `RequestData` is a plain dataclass; handlers are instantiated in the scenario runner and receive the data as arguments.

**Known bug — `hazard_intensity_unit` used before definition**: `run_scenario.py:510-547` references `hazard_intensity_unit` in the else-branch of a conditional that only defines it in the if-branch. Fix during Area 7 refactor; add a regression test.

**Scientific domain validation** (in addition to schema validation): when loading impact functions from the registry, enforce:
- Intensity monotonicity: MDD/PAA must be non-decreasing with intensity
- Unit consistency: impact function intensity unit must match the hazard object's `intensity_unit`
- ID uniqueness: no two impact functions may share the same `haz_type + exp_type + id`
These checks run at registry-load time (startup + custom data import), not inside the computation hot path.

**Files**: `backend/run_scenario.py`, `backend/impact/impact_handler.py`, `backend/base_handler.py`, new `countries/` directory

---

### Area 8 — Performance: Caching & Parallelism (MEDIUM)

- In-memory LRU cache for Entity and Hazard objects
- DuckDB computation cache keyed by input hash
- Parallel GeoJSON generation via ThreadPoolExecutor
- Stream partial results via SSE (exposure map first, then hazard, then impact)
- Convert entity `.xlsx` to `.parquet` for 10-50x faster loading

---

### Area 9 — Testing Strategy (HIGH)

| Layer | Tool | Scope |
|-------|------|-------|
| Backend unit | pytest | Pure functions (beautify_hazard_type, assign_levels, sanitize_country_name) |
| Backend integration | pytest + httpx | FastAPI endpoints with synthetic datasets |
| Frontend unit | Vitest | Utility functions, formatters, data transforms |
| Frontend component | Vitest + React Testing Library | Critical UI components |
| E2E | Playwright (Electron mode) | Golden path: launch → select country → run → verify map |
| CI | GitHub Actions | Gate releases on passing tests |

---

### Area 10 — Cross-Platform (LOW, Phase 5+)

Architecture stays cross-platform-friendly (`app.getPath()`, no Windows-only APIs). No macOS/Linux build targets in early phases — add when demand arises.

---

### Area 11 — Scenario Workspace Management (HIGH)

Replaces folder-copy save/restore with DuckDB-backed workspace:

1. Results stored directly in DuckDB on completion — no file copying
2. Restore = database query (instant)
3. Multiple scenarios coexist without temp dir conflicts
4. Scenario comparison via SQL
5. Filterable/sortable scenario list (replaces flat report list)
6. Granular snapshot deletion
7. PDF export via `webContents.printToPDF()` — no MS Word needed
8. Remove docx2pdf, docxtpl, python-docx from backend

**Scenario naming/annotation**: `scenarioRunCode` is an opaque generated string used internally. Add user-facing fields to the `scenarios` table: `name TEXT` (editable label), `tags TEXT` (comma-separated), `notes TEXT` (free text). Exposed in the workspace list and the run-complete confirmation dialog. Required from v2.0.0 — the DuckDB schema already includes these (see Area 3).

**Workspace backup/restore**: Air-gapped users need to move their scenario history between machines. Add "Export workspace" (produces a `.riskwise-workspace` ZIP: `riskwise.db` + referenced parquet files + snapshots) and "Import workspace" (validates, merges into existing DB without overwriting). Critical for the offline-installer target audience.

**Uninstall UX policy**: Two locations contain user data. Define the contract: NSIS uninstaller removes `%LOCALAPPDATA%/RiskWiseEngine/` (engine, ~500MB) by default. `%APPDATA%/RISK WISE/` (scenarios, reports, logs) is **kept by default** with a "Remove all user data" opt-in checkbox. Document this in the installer and in `docs/reference/offline.md`.

**Files**: Frontend workspace components, backend report handler, DuckDB schema

---

### Area 12 — Modern UI/UX Overhaul (HIGH)

**Decision: Stay on MUI, upgrade to v7.**

Rationale: MUI is most battle-tested (6.7M weekly npm downloads). The problem is MUI without a theme — fix that first.

**MUI v7 theme skeleton**:
```typescript
// src/theme/theme.ts
export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '...' },
    background: { default: '#f8fafc', paper: '#ffffff' },
  },
  typography: { fontFamily: '"Inter", "Segoe UI", sans-serif' },
  shape: { borderRadius: 12 },
});
```

Zero `#XXXXXX` in component code — all colors from theme tokens.

**Layout**: Sidebar nav + top app bar (VS Code-style) replaces fixed tabs. Resizable panels. Full-bleed maps.

**Components**: Skeleton loading states, micro-interactions, toast notifications, animated progress overlay.

**Font**: Inter (free, modern, excellent for data-heavy UIs).

**Optional Phase 5**: Dark mode.

**Files**: New `src/theme/`, every component (incremental migration)

---

### Area 13 — Auto-Update & Release Channels (HIGH)

Full electron-updater overhaul, depends on Area 15 (signing) for trust.

- **Release channels**: `stable`, `beta`, `internal` — tag conventions: `v2.0.1` → stable, `v2.0.1-beta.1` → beta
- **Differential updates**: blockmap-based, downloads only changed blocks
- **User consent UX**: background check on startup + every 4h, "Install on next restart" / "Remind me later", never force-restart
- **In-app release notes**: fetch GitHub Release body (Markdown), render in "What's New" dialog, support `## en` / `## ar` / `## th` sections
- **Python engine updates**: separate `engine-manifest.json` on GitHub Releases: `{version, sha256, download_url, min_app_version, max_app_version}`. Engine versioned independently of app. **`max_app_version`** is the inverse binding: a newer app that requires engine features not in an older cached engine must refuse to use it and trigger re-download. An older cached engine paired with a newer app that requires it **must not silently misbehave** — fail with a clear version-mismatch error.
- **Engine-manifest signing**: the manifest itself must be signed with an offline key (minisign or age) and verified client-side before trusting the SHA-256 inside it. If the GitHub release account is compromised, an unsigned manifest means a malicious engine ships to every user. Publish the public verification key in the app bundle (not fetched at runtime).
- **Resumable engine download**: corporate environments with TLS-inspection proxies can corrupt large downloads. Use HTTP `Range` requests to support resume on retry. After extraction, verify SHA-256 against the (signed) manifest; if the hash fails, delete the partial file and retry from byte offset 0.
- **Rollback**: "Downgrade to previous version" option in Settings
- **Offline mode interaction**: skip all update checks when Area 14 offline toggle is on

**Files**: `build/electron.js`, new `src/components/UpdateDialog.jsx`, `src/components/Settings/UpdatesPanel.jsx`, `.github/workflows/release.yml`

---

### Area 14 — Offline Mode (MEDIUM)

Core computation already works offline; these fail: engine download, update checks, CLIMADA Client API, Leaflet tiles.

- **Two installer variants**: Online (< 150MB, downloads engine on first launch) + Offline all-in-one (bundled engine + Leaflet tile pack + hazard data)
- **Settings toggle**: disables update checks, blocks CLIMADA Client API calls, switches to local tile provider, disables telemetry
- **Leaflet tile fallback**: when offline mode is active, serve tiles from a bundled MBTiles pack via a local tile server (e.g. `@mapbox/mbtiles`). The offline installer includes a tile pack for Egypt and Thailand at zoom levels 0-12. Custom countries require the user to supply a tile pack via `.riskwise-pack`.
- **CLIMADA Client API degraded mode**: if the Client API is unreachable (online mode, but API down), show a non-blocking warning banner rather than failing the run. ERA mode never uses the Client API; custom mode needs it for entity/hazard download — degrade gracefully to "upload your own file" prompt.
- **Manual data packs**: `.riskwise-pack` (signed ZIP) dropped into designated folder, verified and applied on restart
- **Network call audit**: see the Network Calls Inventory section above — use that as the canonical checklist for the offline audit
- Status bar indicator when offline mode active
- **Workspace export/import** (see Area 11) doubles as the air-gapped machine migration path

**Files**: `build/electron.js`, `src/components/Settings/OfflineSection.jsx`, `src/store.js`, `docs/reference/offline.md`

---

### Area 15 — Code Signing (HIGH)

Current: `CSC_IDENTITY_AUTO_DISCOVERY=false` — effectively unsigned. SmartScreen warns on every install.

**Approach**: Wire up all signing infrastructure now; activate when a certificate is obtained.

- **Certificate type**: EV preferred (immediate SmartScreen reputation, ~$300-600/year); OV cheaper but weeks of reputation-building
- **Cloud signing** (avoid USB tokens for CI): Azure Key Vault, DigiCert KeyLocker, or SSL.com eSigner
- **electron-builder config** (add now):
  ```json
  "win": {
    "signingHashAlgorithms": ["sha256"],
    "signAndEditExecutable": true,
    "publisherName": "<org name when cert available>"
  }
  ```
- **Guard in CI**: `if [ -n "$CSC_LINK" ]` — unsigned fallback for dev builds, signed for releases
- **Sign everything**: installer, uninstaller, update payloads, Python engine executable, DLLs

**Files**: `package.json`, `.github/workflows/release.yml`, `build/electron.js`, `docs/reference/signing.md`

---

### Area 16 — Accessibility & Inclusive Design (HIGH)

Target: WCAG 2.1 AA (mandatory in many government procurement contexts).

- Theme-level contrast enforcement: every color token pair checked at build time
- Keyboard-first: every interactive element reachable via keyboard, focus traps in modals, visible focus rings
- ARIA landmarks, labels on custom controls, live regions for progress/errors
- Non-color chart alternatives: patterns + labels; data table fallback for every chart
- RTL layout audit: CI screenshot test in Arabic — icons, progress bars, chart axes must mirror
- NVDA screen reader smoke test on golden path
- `axe-core` via `@axe-core/react` in Vitest; CI fails on new violations
- Conformance statement: `docs/reference/accessibility.md`

**i18n beyond string translation** (in scope for this area):
- **Numerals**: Arabic locale uses Arabic-Indic digits (٠١٢٣) by default. Decide once: use Western digits throughout (consistent with scientific data display) or follow locale. Document the decision; enforce it in the number formatter utility.
- **Dates**: Thai locale uses the Buddhist Era calendar (BE = CE + 543). Year 2050 CE = BE 2593. Any date display (scenario `created_at`, report timestamps) must route through a locale-aware formatter — never raw `toLocaleDateString()` without explicit `calendar` option.
- **Chart axis ticks**: Chart.js tick formatters must use the same locale-aware number/date formatter. Hardcoded `k`/`M` suffixes break in RTL and non-Latin scripts.
- **Pluralization**: i18next supports `_one`/`_other` plural keys — use them for counts ("1 scenario" vs "3 scenarios"). Thai has no grammatical plural; Arabic has six plural forms. Add plural keys from day one, not as a retrofit.
- **BiDi in chart labels**: dataset labels in Chart.js are plain strings — they don't inherit the Unicode BiDi isolation applied to i18next strings. Apply the same isolation logic to chart label strings before passing to Chart.js.

**Files**: `src/theme/theme.js`, every component (ARIA), `tests/a11y/`, `docs/reference/accessibility.md`

---

### Area 17 — Observability, Logging & Diagnostics (MEDIUM-HIGH)

- **Structured logging**: `electron-log` (main, daily rotation 7-day retention), `structlog` JSON (Python, carries request ID), `logger.ts` wrapper (frontend → Electron main via IPC). No raw `console.log` in production (ESLint rule).
- **Request correlation**: UUID generated at frontend, flows in HTTP headers to FastAPI, appears in every log line and error toasts as "Error ID: abc-123"
- **Export Diagnostics**: Settings button → ZIP of logs (all layers) + system info + versions + scenario params. No auto-upload.
- **Opt-in crash reporting**: Sentry gated by first-launch consent. Explicit enumeration of what's sent. Disabled in offline mode.

**Files**: `src/lib/logger.ts`, `backend/logging_config.py`, `build/electron.js`, `src/components/Settings/DiagnosticsSection.jsx`, `docs/privacy.md`

---

### Area 18 — Security Hardening (HIGH)

- **Electron renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, `electron-fuses`, no `webview`, audited `preload.js`
- **Input validation**: Pydantic on all endpoints, file-path normalization (reject `..`, absolute paths), Excel size limits (50MB) to prevent zip-bomb attacks, GeoJSON/TIFF validation
- **SQL safety**: parameterized queries only in DuckDB; lint rule blocks string concatenation for user-controlled values
- **Dependency hygiene**: Dependabot (npm + pip), `npm audit --production` + `pip-audit` in CI, CycloneDX/SPDX SBOM at release
- **Signed data packs**: cryptographic signature verification on `.riskwise-pack` imports
- `SECURITY.md`: vulnerability disclosure policy
- **Third-party attribution / NOTICES.txt**: Government procurement will ask. Generate a `NOTICES.txt` from the SBOM: GADM data (CC BY 4.0, non-commercial restriction on commercial use — verify for v2's licensing model), OpenStreetMap tiles (ODbL), `climate-lama-engine` (MIT — see engine repo `LICENSE`), source-attributed scientific datasets shipped under `data/` (per-dataset license noted in `data/manifest.json`), Inter font (SIL OFL 1.1), every npm and pip dependency. Attach `NOTICES.txt` to every release artifact. Automate generation — never maintain by hand.
- **Secrets ownership**: `CSC_LINK`/`CSC_KEY_PASSWORD` (code signing cert), Sentry DSN, GitHub release-please token, minisign private key for manifest signing. Document who holds each, where it is stored (use GitHub Actions environment secrets with environment protection rules), and who is the break-glass escalation. Review annually.

**Files**: `build/electron.js`, `src/preload.js`, `backend/validation.py`, `SECURITY.md`, `.github/dependabot.yml`

---

### Area 19 — Developer Experience & Community Standards (MEDIUM)

- **Community files**: `README.md` (overhaul), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `CHANGELOG.md`, issue templates, PR template
- **Code quality**: Prettier + ESLint v9, Husky + lint-staged, Ruff + mypy (Python), `.editorconfig`, `pyproject.toml` as single Python config source
- **Conventional Commits**: enables `release-please` for automatic changelog + semantic versioning
- **CLA / contribution IP**: Given the speculative-proprietary posture (D01), `CONTRIBUTING.md` must include an explicit CLA clause stating that contributions assign IP to the maintainer (or are licensed under the project's terms). Without this, third-party contributions muddy ownership before any client deal is signed.
- **ADRs** in `docs/adr/`:
  - `0001-fastapi-over-stdin-stdout.md`
  - `0002-duckdb-for-metadata.md`
  - `0003-mui-v7-over-mantine.md`
  - `0004-minimal-climada-or-lama-engine.md`
  - `0005-fresh-private-repo.md`
- `.nvmrc`, `.python-version`, `devcontainer.json` (optional)
- CI: lint, type-check, audit, SBOM, license compliance, accessibility tests, visual regression

---

### Area 20 — Scientific Reproducibility (MEDIUM-HIGH)

Every scenario in DuckDB captures:
- `app_version`, `engine` (compute backend identifier — `"climate-lama-engine"` for all post-Phase-6 rows), `engine_version`, `climada_version` (nullable; populated only on legacy pre-Phase-6 rows for traceability — new rows are `NULL`)
- `entity_data_sha256`, `hazard_data_sha256`, `country_config_sha256`
- `config_version`, `random_seed`, `computed_at`, optional user annotation

- Provenance block in every exported PDF/Excel (BibTeX/APA citation helper)
- `data/manifest.json`: SHA-256 registry of all shipped datasets, auto-verified on startup
- Versioned country configs (breaking changes bump version)
- `.riskwise-scenario` export: shareable ZIP with provenance manifest + parquet + snapshots

**Determinism realism**: "Bit-identical outputs" is unachievable cross-platform. The compute path uses stochastic sampling for some hazards (event-set generation in `climate-lama-engine`; pre-Phase-6, CLIMADA's equivalent), and BLAS floating-point reductions differ between CPU architectures and OS. The achievable target is:
1. **Seed discipline**: use `np.random.default_rng(seed)` everywhere (not the global `np.random.*` API). Store `random_seed` in the provenance row.
2. **Same-machine reproducibility**: same OS + same Python + same seed → bit-identical. This is the CI determinism test.
3. **Cross-machine tolerance**: define a documented tolerance (e.g. ≤0.01% relative difference in AAL and expected damage by return period). Provenance SHAs are computed on a canonical JSON form of outputs (sorted keys, fixed decimal precision) — not raw floats — so they are stable across platforms.
4. **Document the caveat**: exported reports note "Results reproducible on same OS/hardware with same seed; cross-platform results within ±X% tolerance."

**Determinism CI test**: run identical scenario twice on the same runner → assert bit-identical (same-machine guarantee). Add a cross-platform tolerance test as a separate, non-blocking CI job.

**Files**: `backend/provenance.py`, `data/manifest.json`

---

### Area 21 — In-App Help & Onboarding (MEDIUM-HIGH)

- First-run walkthrough (3-4 steps, skippable, restartable from Help menu)
- Contextual tooltips on every parameter field (in i18n system: en/ar/th)
- Guided tours: "Run your first scenario", "Compare two scenarios", "Export a report", "Add a custom country" — via `react-joyride` or `shepherd.js`
- "What does this mean?" info icon on every chart/result → glossary popover
- Searchable in-app glossary: `src/content/glossary/{en,ar,th}.md` with climate-risk terms
- F1 Help menu: contextual links + diagnostics export trigger
- Empty states that teach (not blank space)

**Files**: `src/components/Help/`, `src/components/Onboarding/`, `src/content/glossary/`

---

### Area 22 — Extensibility: Custom Hazards, Measures & Impact Functions (MEDIUM)

Auto-scan `%APPDATA%/RISK WISE/user-data/` at startup for:
- `countries/{ISO3}/` — custom country configs + impact functions (same schema as built-in)
- `measures/` — user-defined adaptation measures (JSON/YAML)
- `hazards/` — user-supplied hazard data (`.h5` or TIFF with documented metadata)

- Strict schema validation with actionable error messages
- Namespace isolation: built-in vs "Custom" labeled in dropdowns
- Settings > Custom Data: import (drag-and-drop ZIP), validate, delete
- `docs/reference/extending.md`: full schema docs with Egypt/Thailand as canonical examples
- `.riskwise-country-pack` export format (shareable, signed)

**Files**: `backend/plugins/`, `src/components/Settings/CustomDataSection.jsx`, `docs/reference/extending.md`

---

### Area 23 — Macroeconomic (CRED) Pipeline (HIGH)

The second major tab in the app (Tab 2) is powered entirely by a separate data pipeline independent of the CLIMADA risk assessment in Tab 1.

**What it does**: Displays pre-computed macroeconomic impact timeseries (2020–2080) from CRED (Centre for Research on the Epidemiology of Disasters) data, broken down by country, climate scenario (SSP), economic variable, and sector. Shows two lines: "with adaptation" and "without adaptation". Data is currently in `requirements/cred_output.xlsx`, sheet `cred_output`. Read by `backend/macroeconomic/macroeconomic_handler.py`, served via `run_fetch_macro_chart_data.py`.

**v2 changes**:
- Move built-in CRED data from Excel into DuckDB at install/first-launch time (same migration runner as Area 3)
- **User-uploadable CRED data**: Settings > CRED Data panel: upload own `.xlsx` (same schema as built-in), stored in `%APPDATA%/RISK WISE/cred/`. Multiple uploaded files versioned and listed in a dropdown ("Built-in v2024", "My country CRED 2026", …). User selects active dataset per session.
- Validate uploaded xlsx against a documented schema (sheet name, column names, data types, country codes, valid SSP values) with actionable error messages
- New API endpoint: `GET /api/v1/macro/datasets` (list available CRED datasets), `POST /api/v1/macro/datasets` (upload new), `DELETE /api/v1/macro/datasets/{id}`, `POST /api/v1/macro/chart-data` (unchanged)
- CRED dataset provenance: `cred_datasets` table in DuckDB tracks `id, name, source, uploaded_at, is_builtin, sha256`
- Chart rendered in React (Chart.js) — same pattern as Area 6

**CRED data schema** (what the xlsx must contain):

| Column | Type | Notes |
|--------|------|-------|
| country | string | ISO3 code |
| scenario | string | "SSP1", "SSP2", "SSP3", "SSP5" |
| variable | string | e.g. "GDP", "Capital stock" |
| sector | string | e.g. "Agriculture", "All" |
| year | integer | 2020–2080 |
| value_with_adaptation | float | |
| value_without_adaptation | float | |

**API endpoints to add**:
```
GET    /api/v1/macro/datasets
POST   /api/v1/macro/datasets
DELETE /api/v1/macro/datasets/{id}
POST   /api/v1/macro/chart-data     (existing, add dataset_id param)
```

**Files**: `backend/macroeconomic/`, `backend/db/` (cred_datasets table), new `src/components/Settings/CREDDataSection.jsx`, `src/components/MacroView/`

---

### Area 24 — Adaptation Measures (HIGH)

The cost-benefit axis (Tab 1 → CostBen sub-tab) is driven entirely by `requirements/adaptation_measures.xlsx`. This is a first-class data layer that has had no dedicated ownership in the plan.

**What it contains**: Each row defines one adaptation measure: `measure_id`, `country`, `hazard_type`, `exposure_type`, `name`, `cost_factor`, `hazard_reduction_percentage`, `description`. The `costben_handler.py` loads this file, filters by the active scenario parameters, and passes measures to CLIMADA's `CostBenefitAnalysis` class.

**v2 changes**:
- Move built-in measures from xlsx into DuckDB `adaptation_measures` table
- **User-definable measures**: same upload pattern as Area 23 — users upload custom measures xlsx (documented schema, validated on import); merged with built-in set in dropdowns labeled "Built-in" vs "Custom"
- Strict schema validation at import time: cost_factor > 0, hazard_reduction_percentage ∈ [0, 100], measure_id unique per (country, hazard, exposure) tuple
- **Cite sources on built-in measures**: each built-in measure should have a `source_reference` field citing where the cost/effectiveness estimate comes from (e.g. GIZ study, literature)
- API: `GET /api/v1/measures/{country}/{hazard}` already planned (Area 1) — extend to accept `dataset_id` param for custom measure sets

**DuckDB table**:
```sql
adaptation_measures (id, measure_set_id, country, hazard_type, exposure_type,
                     name, cost_factor, hazard_reduction_percentage,
                     description, source_reference, is_builtin)
measure_sets (id, name, uploaded_at, is_builtin, sha256)
```

**Files**: `backend/costben/costben_handler.py`, `backend/db/` (measures tables), new `src/components/Settings/MeasuresSection.jsx`

---

## Error-Code Taxonomy

One catalogue, referenced everywhere: error toasts, support diagnostics ZIPs, and test assertions.

`backend/run_scenario.py` already uses numeric prefixes (2000/3000/4000). Formalise:

| Range | Domain | Examples |
|-------|--------|---------|
| 1000–1999 | IPC / API layer | 1001 malformed request, 1002 unknown endpoint |
| 2000–2999 | Data validation | 2001 invalid country, 2002 hazard file not found, 2003 entity file schema error |
| 3000–3999 | Computation | 3001 CLIMADA import error, 3002 impact function mismatch, 3003 cancelled by user |
| 4000–4999 | Output / export | 4001 DuckDB write error, 4002 PDF generation failed, 4003 Excel export error |
| 5000–5999 | Infrastructure | 5001 engine version mismatch, 5002 memory pre-flight check failed, 5003 DuckDB migration failed |
| 6000–6999 | CRED / macro | 6001 CRED dataset schema error, 6002 country not in dataset |

Full catalogue lives in `docs/errors.md`. Each error has: code, short name, user-facing message template, suggested action, backend log level.

---

## Performance Benchmark Targets

Phase 0 spike must produce measured results against these targets. "Significantly smaller" is not a target.

| Metric | Target | Notes |
|--------|--------|-------|
| Online installer size | ≤ 150 MB | Engine downloaded post-install |
| Offline installer size | ≤ 900 MB | Engine + EGY/THA tile pack + hazard data |
| App cold-start to ready | ≤ 5 s | From double-click to health endpoint responding |
| Egypt flood ERA scenario | ≤ 90 s | On reference hardware: 16 GB RAM, 4-core CPU |
| Thailand heatwave ERA scenario | ≤ 120 s | Larger raster |
| Scenario restore from DuckDB | ≤ 1 s | Query only, no recomputation |
| CRED chart render | ≤ 500 ms | Data fetch + Chart.js render |

Reference hardware for benchmarks: Windows 11, Intel i5 (4 cores), 16 GB RAM, SSD. Document this in `docs/reference/benchmarks.md`.

---

## Implementation Phases

### Phase 0: Research Spikes (Weeks 1-2)
*De-risk highest-uncertainty decisions before committing*

- [ ] Python bundling: strip deps, attempt Nuitka → PyInstaller, measure size/startup/speed
- [ ] `climate_lama_engine` evaluation: hazard coverage vs RISK WISE needs, effort to extend
- [ ] MUI v7 theme prototype: upgrade, build ThemeProvider, migrate one screen
- [ ] FastAPI + Electron HTTP proof-of-concept on locked-down Windows
- [ ] Code signing research: EV vs OV, cloud signing providers, cost/decision doc
- [ ] Auto-update UX: channel naming, engine-manifest format, toast/dialog design
- [ ] Accessibility baseline: axe-core violation count on v1, NVDA walkthrough
- [ ] Security baseline: webPreferences audit, CSP inventory, preload surface

**Deliverable**: `docs/spikes/` decision documents with measured results

### Phase 1: Foundation (Weeks 3-7)
*Replace the communication backbone, add resilience*

- [ ] Area 1: FastAPI + SSE
- [ ] Area 2: Process supervision, structured errors
- [ ] Area 5: Pydantic models + TypeScript types
- [ ] Area 9 (start): pytest + Vitest, pure function tests
- [ ] Area 12.1: MUI v7 upgrade + ThemeProvider + design tokens
- [ ] Area 15 (infra): Signing config wired up, cert-optional build
- [ ] Area 17 (foundation): Structured logging + request-ID correlation
- [ ] Area 18 (baseline): Electron hardening, Dependabot, audit CI jobs
- [ ] Area 19: Community files, Ruff/mypy, Husky, Conventional Commits, ADRs

**Verification**: health endpoint → scenario via HTTP → SSE progress → kill Python → auto-restart → error toast with Error ID → theme tokens pass contrast checks → CI gates lint + type-check + audit

### Phase 2: Data & Backend Cleanup (Weeks 8-12)
*Database, backend refactor, chart migration*

- [ ] Area 3: DuckDB integration + migration runner + schema_version table
- [ ] Area 7: Refactor run_scenario.py, country configs, ERA constants extracted, RequestData cleaned, bug fixed
- [ ] Area 6: Frontend charts (remove matplotlib)
- [ ] Area 11 (start): DuckDB save/restore, scenario naming/annotation
- [ ] Area 20: Scenario provenance, data/manifest.json, determinism CI test (same-machine only)
- [ ] Area 22 (foundation): User data directory, schema validation, built-in/custom labels
- [ ] Area 23 (foundation): CRED data migrated to DuckDB; built-in dataset served from DB
- [ ] Area 24 (foundation): Adaptation measures migrated to DuckDB; source citations added

**Verification**: scenario → DuckDB → instant restore → interactive waterfall chart → custom country config runs end-to-end → CRED chart served from DuckDB → scenario has user-editable name

### Phase 3: UI Overhaul (Weeks 13-17)
*Visual transformation, workspace, accessibility baseline*

- [ ] Area 12.2-12.6: Layout, animations, typography, component polish
- [ ] Area 11 (complete): Workspace UI, search/filter, PDF export, workspace backup/restore
- [ ] Area 8: Caching + parallel GeoJSON
- [ ] Area 16 (baseline): ARIA, keyboard nav, RTL audit, non-color chart alternatives, i18n formatters (digits/dates/plurals/chart ticks)
- [ ] Area 21: Onboarding, tooltips, guided tours, glossary, F1 help
- [ ] Area 22 (UI): Custom Data settings panel
- [ ] Area 23 (UI): CRED Data settings panel (upload, select, delete CRED datasets)
- [ ] Area 24 (UI): Measures settings panel (upload, select custom measure sets)

**Verification**: modern look → smooth transitions → scenario list with search → PDF without MS Word → cached repeat run is faster → onboarding tour completes → keyboard-only golden path → Arabic RTL layout correct → workspace ZIP exported and re-imported → CRED user dataset uploaded and chart shown

### Phase 4: Environment & Polish (Weeks 18-20)
*Lean distribution, hardened tests, full feature completion*

- [ ] Area 4: Execute Phase 0 decision (lean backend); verify against benchmark targets
- [ ] Area 9 (complete): Integration tests, Playwright E2E, CI gates
- [ ] Area 13 (complete): Full auto-update flow, engine manifest with offline key signing, resumable download
- [ ] Area 14: Offline installer, offline toggle, MBTiles tile pack, data-pack import, workspace export/import
- [ ] **Engine hosting migration**: move engine ZIP and `engine-manifest.json` off the v1 public GitHub repo to the v2 release pipeline before any public v2 release. Update `installer.nsh` and `electron.js` download URLs. The v1 public repo must not host v2 artifacts.
- [ ] Area 15 (activate): Sign release when cert available
- [ ] Area 16 (audit): WCAG 2.1 AA conformance pass, NVDA smoke test, axe-core in CI
- [ ] Area 17 (complete): Export Diagnostics, opt-in Sentry
- [ ] Area 18 (audit): SBOM, signed data-pack verification
- [ ] Area 20 (complete): Provenance in reports, `.riskwise-scenario` export
- [ ] Final: i18n audit, performance profiling

**Verification**: installer size meets target → Playwright smoke passes → all 3 languages complete → auto-update consent flow works → offline installer runs on airplane-mode VM → NVDA drives golden path → diagnostics ZIP usable → SBOM attached to release

### Phase 5: Optional / Later
- Cross-platform builds (macOS, Linux) — when demand arises
- Dark mode
- Scenario comparison overlay view
- Hosted/remote backend variant for enterprise

---

## Key Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IPC | FastAPI + loopback HTTP | Request IDs, typed contracts, SSE, timeout support |
| Database | DuckDB | Embedded analytical DB, native Parquet, instant queries |
| UI library | MUI v7 (upgrade, not replace) | Largest ecosystem; real problem is missing theme |
| Charts | Chart.js in React | Remove matplotlib, gain interactivity |
| Python bundler | Nuitka (evaluate first) | 2-4x faster than PyInstaller, direct addresses prior slowness |
| Compute engine | CLIMADA vs climate_lama_engine | Needs Phase 0 spike to decide |
| Font | Inter | Modern, free, excellent for data UIs |
| Logging | structlog (Python) + electron-log + logger.ts | Request-ID correlation across the full stack |
| Signing | EV cert + cloud HSM | Immediate SmartScreen trust; no USB token in CI |
| Accessibility | WCAG 2.1 AA | Government procurement requirement |
| Commits | Conventional Commits + release-please | Automatic changelog, semantic versioning |

---

## Critical Files to Modify

| File | Current | v2 Change |
|------|---------|-----------|
| `backend/app.py` | 125L stdin dispatcher | Rewrite as FastAPI app |
| `backend/run_scenario.py` | 805L monolith | Unify ERA/custom, extract country config |
| `backend/impact/impact_handler.py` | 661L if/elif chain | Registry pattern from JSON config |
| `backend/base_handler.py` | 676L | Shared utilities, SSE, DuckDB |
| `backend/costben/costben_handler.py` | 290L, returns PNG | Return JSON data |
| `build/electron.js` | 824L | HTTP client, supervisor, update manager |
| `src/APIService.js` | 143L, sends `.py` filenames | Typed HTTP client |
| `src/store.js` | ~200L, 40+ flat props | Error state, workspace state, typed API |
| `src/App.jsx` | ~150L, fixed tabs | Sidebar nav, ThemeProvider |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/theme/theme.ts` | MUI design system + all tokens |
| `backend/db/` | DuckDB schema, queries, migrations |
| `backend/provenance.py` | Provenance capture per scenario |
| `backend/validation.py` | Input validation (paths, sizes, schemas) |
| `backend/logging_config.py` | structlog JSON with request-ID |
| `backend/plugins/` | User data discovery + validation |
| `countries/EGY/config.json` | Egypt country config |
| `countries/THA/config.json` | Thailand country config |
| `pyproject.toml` | Single Python dependency spec |
| `src/lib/logger.ts` | Frontend logger (routes to Electron main) |
| `src/preload.js` | Tightened to minimum surface |
| `src/components/UpdateDialog.jsx` | Update consent UX |
| `src/components/Settings/UpdatesPanel.jsx` | Channel switcher, rollback |
| `src/components/Settings/OfflineSection.jsx` | Offline toggle, data-pack import |
| `src/components/Settings/DiagnosticsSection.jsx` | Export diagnostics, Sentry consent |
| `src/components/Settings/CustomDataSection.jsx` | Custom data management |
| `src/components/Help/` | F1 help menu, glossary |
| `src/components/Onboarding/` | First-run tour, guided tours |
| `src/content/glossary/{en,ar,th}.md` | Climate-risk glossary |
| `tests/a11y/` | axe-core accessibility tests |
| `data/manifest.json` | Built-in data registry with SHA-256 |
| `engine-manifest.json` | Engine version + download URL (published to Releases) |
| `docs/adr/` | Architectural Decision Records |
| `docs/reference/accessibility.md` | WCAG conformance statement |
| `docs/privacy.md` | What's logged, what's transmitted |
| `docs/reference/offline.md` | Offline capabilities guide + uninstall UX policy |
| `docs/reference/signing.md` | How to activate signing when cert available |
| `docs/reference/extending.md` | Custom data schema docs |
| `docs/errors.md` | Error-code catalogue (1000–6999) |
| `docs/reference/benchmarks.md` | Performance targets and reference hardware |
| `SECURITY.md` | Vulnerability disclosure |
| `NOTICES.txt` | Third-party attribution (auto-generated from SBOM) |
| `CONTRIBUTING.md` | Dev setup, style guides, PR process, CLA clause |
| `CODE_OF_CONDUCT.md` | Contributor Covenant |
| `.github/ISSUE_TEMPLATE/` | Bug/feature/scenario templates |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |
| `.github/dependabot.yml` | Weekly dependency update PRs |
| `countries/EGY/config.json` | Egypt country config (discount rate, return periods, growth rates with citations) |
| `countries/THA/config.json` | Thailand country config |
| `src/components/Settings/CREDDataSection.jsx` | CRED dataset management |
| `src/components/Settings/MeasuresSection.jsx` | Adaptation measures management |
| `backend/db/migrations/` | Schema migration SQL scripts |

---

## Verification Criteria (Acceptance Tests per Phase)

These are the "done means" definitions for each phase. Use them as acceptance criteria when writing GitHub issues.

| Phase | Test | How to verify |
|-------|------|---------------|
| 0 | Python bundling spike | Produce a working Nuitka or PyInstaller build of stripped CLIMADA; measure bundle size, startup time, runtime performance |
| 0 | climate_lama_engine | Run flood scenario through it; compare results to CLIMADA output within tolerance |
| 0 | MUI v7 theme prototype | Upgrade to MUI v7, refactor one screen to pure theme tokens, verify Leaflet + i18n still work |
| 0 | FastAPI prototype | `curl 127.0.0.1:{port}/health` returns 200 in a test Electron + Python setup |
| 0 | Code signing research | Decision document: EV vs OV, cloud signing options, provider quotes, who pays |
| 0 | Accessibility baseline | axe-core violation count on v1; manual NVDA walkthrough notes; RTL layout issues list |
| 0 | Security baseline | Inventory of webPreferences, CSP, preload surface, shell.openExternal usage, user-path flow |
| 1 | FastAPI communication | Run scenario via HTTP; verify SSE stream delivers progress events |
| 1 | Error recovery | Kill Python process; verify auto-restart; frontend shows error toast with Error ID |
| 1 | Type safety | Change a Pydantic response field; verify TypeScript compilation fails |
| 1 | Logging correlation | Make one API call; verify same request ID in Electron main log, Python backend log, and error toast |
| 1 | Electron hardening | Attempt `require('child_process').exec` from renderer console; verify it fails |
| 1 | Signing infrastructure | CI build with `CSC_LINK` set produces signed installer; without `CSC_LINK` still succeeds unsigned |
| 1 | Conventional commits | Push a `feat:` commit; verify release-please generates correct changelog entry |
| 2 | DuckDB | Run scenario; query DuckDB directly to verify results stored; restore scenario and verify instant load |
| 2 | Charts | Run scenario; verify waterfall chart is interactive (hover shows values); export chart as image |
| 2 | Provenance | Save a scenario; read DuckDB row and verify all provenance fields are non-null |
| 2 | Determinism | Run identical scenario twice on same machine; verify bit-identical outputs |
| 2 | ERA constants | Egypt discount rate, return periods, growth rates read from `countries/EGY/config.json` not hardcoded |
| 2 | Schema migration | Manually insert a v1 DuckDB row; run v2 migration; verify row is readable with new schema |
| 2 | Custom country | Drop valid country config in user data dir; restart; scenario runs end-to-end labeled "Custom" |
| 2 | CRED in DuckDB | Query `cred_datasets` table; verify built-in dataset present; CRED chart renders from DB |
| 3 | UI | Visual regression screenshots; test animations at 60fps; zero `#XXXXXX` in component code |
| 3 | Workspace | Save 3 scenarios; search/filter by country; export PDF without MS Word |
| 3 | Keyboard-only flow | Complete golden-path scenario flow without touching the mouse |
| 3 | Onboarding | Fresh install: first-run tour appears; skip and restart from Help menu |
| 3 | RTL layout | Switch to Arabic; screenshot every primary screen; icons/progress bars/chart axes mirror correctly |
| 3 | Workspace backup | Export workspace ZIP; import on a fresh DB; verify all scenarios restored |
| 3 | CRED upload | Upload custom CRED xlsx; select it; verify chart shows custom data |
| 3 | Scenario naming | Complete a run; rename it in the workspace list; verify name persists across restart |
| 4 | Installer size | Online installer ≤ 150 MB; offline installer ≤ 900 MB |
| 4 | E2E | Playwright: launch → select Egypt + Flood → run → verify Leaflet map renders → save → restore |
| 4 | Auto-update end-to-end | Install v2.0.0; release v2.0.1 to beta channel; app detects update, shows consent dialog, installs on restart |
| 4 | Engine manifest | Change engine version in engine-manifest.json; app prompts for engine re-download and applies it |
| 4 | Offline installer | Install on airplane-mode Windows VM; app launches, runs Egypt flood scenario, shows clear error for network actions |
| 4 | Offline toggle | Enable "Offline mode" in Settings; update checks stop, Leaflet switches to cached tiles. (Pre-Phase-6 this also blocked the CLIMADA Client API; post-Phase-6 there is no equivalent runtime network dependency to block — the engine has no Client.) |
| 4 | Data pack import | Drop signed `.riskwise-pack` in designated folder; change takes effect after restart |
| 4 | Data pack rejection | Import `.riskwise-pack` with invalid signature; import fails with clear error |
| 4 | Signed installer | Install on clean Windows VM; SmartScreen passes immediately (EV) or reputation process understood (OV) |
| 4 | axe-core in CI | Introduce known accessibility violation in a branch; CI fails with clear message |
| 4 | NVDA smoke | Start NVDA; complete golden-path scenario flow with no blocker issues |
| 4 | Diagnostics export | Click "Export Diagnostics"; ZIP contains logs from all three layers + version info + scenario state |
| 4 | SBOM | Build a release; CycloneDX/SPDX SBOM is attached as a release artifact and lists all dependencies |
| 4 | NOTICES.txt | Release artifact includes auto-generated NOTICES.txt covering all npm + pip deps |
| 4 | Engine manifest signing | Tamper with engine-manifest.json; app rejects it with a signature-mismatch error |
| 4 | Engine hosting | engine-manifest.json and engine ZIP served from v2 release, not v1 public repo |
| 4 | Performance | Egypt flood ERA scenario completes in ≤ 90 s on reference hardware (16 GB, 4-core) |
| 4 | Memory pre-flight | Simulate low memory; app returns error 5002 before starting computation |

---

## Where to Start

If picking this up fresh:

1. **Read this document** and `docs/decisions.md` — they are the two canonical references.
2. **Check Phase 0 status** — have the research spikes been done? Look in `docs/spikes/`.
3. **Check Phase 1 status** — has FastAPI replaced stdin/stdout? Check `backend/app.py`.
4. **Run the app** — `npm run quickstart` (needs conda env active). Current entry: `build/electron.js` spawns `backend/app.py`.
5. **Pick the next unchecked Phase item** and implement it, using the Verification Criteria table above as the acceptance test.

The phases are sequenced by dependency: Area 1 (FastAPI) must precede Area 3 (DuckDB) and Area 11 (workspace). Area 12.1 (MUI theme) can proceed in parallel with Area 1.
