# Architectural Decisions

Key decisions made during the v2 design. Each entry records what was decided, why, and what was rejected.

---

## D01 — Private duplicate repo, not a GitHub fork

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: v2 is developed in a fresh private repo cloned from v1.0.8, not in a GitHub fork of the public repo.

**Why**:
- GitHub fork networks are discoverable even for private forks ("forked from ..." appears in the UI and network graph), leaking metadata about v2 activity to the client before terms are agreed.
- Detaching from a fork network requires a GitHub Support request — not self-service.
- A clean clone produces a clean history for the eventual commercial handover.

**Rejected**:
- GitHub fork: fork-network exposure, no leverage.
- Long-lived branch in public repo: visible to client and watchers.
- Reusing `CortoMaltese3/RISK_WISE_v2`: that repo is a fork of `AnalyticsTeamUNUEHS/ERA_projects_SWORD` (original upstream), so it carries the same fork-network problem.

**Consequence**: `https://github.com/CortoMaltese3/riskwise-v2` is the v2 home. Public repo receives only v1 bug fixes until a commercial decision is made.

**Single-maintainer continuity**: If the primary maintainer becomes unavailable before a client deal is signed, the client (GIZ/UNU-EHS) should receive: (a) a full repo ZIP of the v2 private repo, (b) all environment secrets transferred to a designated GIZ technical contact, (c) the ARCHITECTURE.md and DECISIONS.md as the canonical handover documents. This should be documented in the contract. The two docs in `docs/` are written explicitly to enable cold-start by anyone with Python + Electron knowledge.

---

## D02 — FastAPI on loopback HTTP, not stdin/stdout

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Replace the stdin/stdout IPC channel with a FastAPI server bound to `127.0.0.1:0` (OS-assigned port). Electron reads the port from a single startup message, then all further communication is HTTP + SSE.

**Why**:
- stdin/stdout has no request IDs, no multiplexing, no timeout, no cancellation. A slow scenario blocks everything.
- HTTP gives request-ID correlation, typed contracts, SSE for progress, standard tooling (curl, httpx, Postman), and testable endpoints.
- `127.0.0.1` is kernel-level IPC — it never touches a network interface. Enterprise firewalls target external interfaces. If loopback were blocked, VS Code, Docker, and most database clients would break.

**Rejected**:
- **stdin/stdout (status quo)**: no request correlation, single-threaded, untestable.
- **Windows Named Pipes**: more complex setup, Windows-only, loses HTTP tooling benefits. Kept as a fallback option if loopback is blocked in an extreme edge-case deployment.
- **WebSockets**: heavier than needed; SSE covers the one-way progress streaming use case.

**Consequence**: Startup adds a port-handshake step. All other IPC is standard HTTP. Python process can handle concurrent requests.

---

## D03 — DuckDB for scenario storage and metadata

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Use DuckDB (embedded analytical database) to store scenario metadata, results, computation cache, and map snapshots. Replace `_metadata.txt` (tab-delimited) and folder-copy save/restore.

**Why**:
- Current folder-copy save/restore is fragile and slow. Running a new scenario clears the temp dir, losing unsaved work.
- DuckDB embeds like SQLite (zero config, single file) but is optimized for analytical queries and has native Parquet read/write.
- Scenario restoration becomes a database query (instant) instead of copying files.
- Cross-scenario comparison, search, and filter become SQL queries.
- MIT licensed, 75k+ GitHub stars, used in production by Google, Meta.

**Rejected**:
- **SQLite**: optimized for OLTP, not analytical queries. No native Parquet support. DuckDB is a strict upgrade.
- **PostgreSQL/MySQL**: requires a server process — not appropriate for a desktop app.
- **File system (status quo)**: no query capability, fragile metadata, slow restore.

**Consequence**: `.h5`/`.tif` hazard data, `.xlsx` entity defs, and `.geojson` boundaries stay as files (CLIMADA's native formats). Everything else moves to DuckDB.

---

## D04 — Stay on MUI, upgrade to v7

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Upgrade from MUI v5.15 to MUI v7 rather than switching to a different component library (Mantine, shadcn/ui, etc.).

**Why**:
- MUI has 6.7M weekly npm downloads (~10x Mantine) — largest ecosystem, most community support, most readily available expertise.
- The real problem is not MUI itself — it's MUI without a theme. All 30+ colors are hardcoded inline via `sx` props. Introducing a proper `ThemeProvider` with design tokens gives the modern look without a library migration.
- MUI v7 adds CSS variables for runtime theming and performance improvements.

**Rejected**:
- **Mantine v7**: technically better (CSS Modules, smaller runtime) but smaller community and less institutional support.
- **shadcn/ui**: excellent DX but requires Tailwind, which conflicts with MUI's styling system.
- **Rebuild with no component library**: too much work, not justified.

**Consequence**: Upgrade path is MUI v5 → v7. All hardcoded hex colors replaced with theme tokens. Zero `#XXXXXX` in component code.

---

## D05 — Python compute engine: evaluate before committing

**Status**: Under investigation (Phase 0 spike required)  
**Date**: 2026-04-16

**Decision**: Do not commit to a specific Python compute approach until Phase 0 research spikes are complete. Three tracks:

- **Track A**: Minimal CLIMADA + Nuitka bundler. Strip unused packages (matplotlib, Flask, Selenium, docx libs, folium, geocoder, ipykernel). Nuitka compiles Python to C/C++ with 2-4x speedup vs PyInstaller — directly addresses the "PyInstaller was too slow" problem from prior attempts.
- **Track B**: Replace CLIMADA with `climate_lama_engine` (maintainer's own PyPI package, ~20KB, NumPy+SciPy only). Would shrink installer from ~500MB to ~50MB. Currently covers river flood only — needs evaluation for drought/heatwave coverage.
- **Track C**: Remote computation backend. Desktop is a thin client. **Not recommended** — breaks offline use, which is a hard requirement.

**Why not commit now**: CLIMADA has complex C extensions (GDAL, rasterio, scipy). Previous PyInstaller attempts failed or produced unacceptably slow executables. The right path depends on what `climate_lama_engine` covers and how Nuitka handles the geospatial stack.

**Phase 0 acceptance threshold** (quantitative — "done" must be unambiguous):

For Track B (`climate_lama_engine`) to be selected, it must satisfy **all** of:
1. Runs the Egypt flood ERA scenario end-to-end without error
2. AAL (Average Annual Loss) within ±2% of CLIMADA 4.1.1 output on the same entity/hazard files
3. Expected damage by return period (50, 100, 250 yr) within ±5% of CLIMADA output
4. Covers drought and heatwave hazards (or a credible extension plan with estimated effort ≤ 2 weeks)
5. Bundled installer ≤ 150 MB online / ≤ 900 MB offline

Track A (CLIMADA + Nuitka) is selected by default if Track B fails any of the above. The decision document must record the actual measured numbers for both tracks.

**Consequence**: Phase 0 delivers a decision document with measured results against the above thresholds. Phase 4 executes the chosen track.

---

## D06 — All charts rendered in frontend (remove matplotlib)

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Move waterfall and cost-benefit chart rendering from Python (matplotlib PNG) to React (Chart.js). Backend returns structured JSON; frontend renders interactive charts.

**Why**:
- Static PNGs are non-interactive (no hover, zoom, or export).
- matplotlib adds ~30MB to the Python environment.
- Frontend charts inherit the MUI design system automatically.
- Structured JSON data format is simpler to test than image output.

**Rejected**:
- **Keep matplotlib**: no interactivity, large dependency, styling mismatch.
- **Plotly in Python → HTML**: complex, adds another large dependency.

**Consequence**: `costben_handler.py` returns JSON data instead of writing PNG files. New React chart components replace static `<img>` tags.

---

## D07 — Code signing: wire infrastructure now, activate when cert available

**Status**: Accepted (cert not yet obtained)  
**Date**: 2026-04-16

**Decision**: Wire all signing config into `package.json` and CI with a `CSC_LINK`-based opt-in guard. Unsigned builds still succeed. Signed builds are produced when `CSC_LINK` is set in CI secrets.

**Why**:
- Current unsigned installer triggers SmartScreen warnings on every install and first launch.
- Some enterprise/government Windows policies refuse unsigned executables.
- `electron-updater` cannot verify update integrity without signing.
- Certificate procurement is pending (client unwilling to pay; maintainer exploring company cert or personal cert). Infrastructure must be ready to activate the moment a cert is available.

**Certificate preference**: EV (Extended Validation) — immediate SmartScreen reputation on first install. OV is cheaper but requires weeks of reputation-building through download volume.

**Cloud signing** (avoid USB hardware tokens in CI): Azure Key Vault Code Signing, DigiCert KeyLocker, or SSL.com eSigner.

**Rejected**:
- **Self-signed cert**: no SmartScreen trust, same warnings as unsigned.
- **Accept warnings permanently**: unprofessional for a government-facing tool.

**Consequence**: `CSC_IDENTITY_AUTO_DISCOVERY=false` stays in dev builds. CI release workflow gets a signing step that activates when `CSC_LINK` is populated.

---

## D08 — Conventional Commits + release-please for versioning

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Adopt Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) and automate changelog generation + semantic version bumps via `release-please`.

**Why**:
- Eliminates manual changelog maintenance.
- Version bumps are driven by commit content (feat → minor, fix → patch, BREAKING CHANGE → major).
- Scannable git log for anyone reading the history.

**Rejected**:
- **Manual versioning**: error-prone, inconsistent.
- **semantic-release**: similar capability but more complex setup; `release-please` integrates better with GitHub.

---

## D09 — Offline mode: first-class user-selectable option, not the default

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Offline operation is supported via a Settings toggle and a separate all-in-one installer variant. It is not the default mode.

**Why**:
- Target users (government officials in restricted environments) sometimes operate in air-gapped networks.
- Core CLIMADA computation already runs locally. The gaps are: engine download, update checks, CLIMADA Client API, and Leaflet tiles.
- Making it the default would complicate the standard experience unnecessarily.

**Two installer variants**:
- Online installer (< 150MB target): downloads Python engine on first launch.
- Offline all-in-one: bundles engine + Leaflet tile pack + baseline hazard data. Larger download, but fully self-contained.

**Consequence**: Network calls must be audited and categorized (core vs enhancement). Enhancement calls are blocked when offline toggle is enabled.

---

## D10 — PDF export from frontend, remove python-docx stack

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Generate PDFs using Electron's `webContents.printToPDF()` from a React report layout component. Remove `docx2pdf`, `docxtpl`, and `python-docx` from the Python backend.

**Why**:
- Current PDF export requires MS Word to be installed on the user's machine.
- Electron's built-in PDF generation needs no external dependency.
- A React report component can be styled consistently with the rest of the app.
- Removes ~50MB of Python dependencies.

**Rejected**:
- **Keep Word-based export**: requires MS Word, unreliable in government environments.
- **WeasyPrint / ReportLab**: adds Python dependencies; frontend approach is simpler.

**Excel export** (via `xlsxwriter` in Python) stays as-is — it provides formatting that `printToPDF` cannot match for tabular data.

---

## D11 — WCAG 2.1 AA as accessibility baseline

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Target WCAG 2.1 AA compliance. Enforce via `axe-core` in CI (fails on new violations). Document conformance in `docs/accessibility.md`.

**Why**:
- RISK WISE is government-facing. Many public-sector procurement requirements mandate WCAG 2.1 AA.
- Current state: hardcoded colors with no contrast guarantees, no ARIA, no tested keyboard navigation.
- Accessibility is significantly cheaper to build in during the UI overhaul than to retrofit later.

**Consequence**: MUI theme tokens must pass contrast checks at build time. Every custom component gets ARIA labels. RTL layout (Arabic) must mirror icons, progress bars, and chart axes — not just text direction.

---

## D13 — CRED macroeconomic data in DuckDB with user-upload option

**Status**: Accepted  
**Date**: 2026-04-17

**Decision**: Migrate the built-in CRED timeseries data from `requirements/cred_output.xlsx` into DuckDB on first launch. Allow users to upload their own CRED xlsx files (same schema), stored in `%APPDATA%/RISK WISE/cred/` and tracked in a `cred_datasets` table. A dropdown in Settings lets the user choose which dataset is active. Multiple uploads are retained and versioned.

**Why**:
- The Excel file is an opaque blob — no query, no versioning, no provenance.
- Different country teams may have more recent or country-specific CRED data; locking them to the built-in file is a blocker.
- DuckDB schema ensures structure validation at import time, not silently at chart render time.
- A named, dated dataset list makes it clear which data version produced a given chart.

**Rejected**:
- **Keep as Excel, just add file picker**: no validation, no versioning, no provenance, no DuckDB integration.
- **Remote CRED API**: breaks offline use.

**Consequence**: `requirements/cred_output.xlsx` stays as the canonical source for the built-in migration. New API endpoints added (see Area 23). User-uploaded files validated against documented schema on import.

---

## D14 — ERA scientific constants: user-adjustable via country configs and entity files

**Status**: Accepted  
**Date**: 2026-04-17

**Decision**: Move all hardcoded ERA constants (Egypt discount rate 6.89%, Thailand discount rate 0.90%, per-sector growth rates, return periods in `get_custom_rp_per_hazard()`) from `run_scenario.py` into `countries/{ISO3}/config.json` with cited sources. In ERA mode, constants are pre-set from config but overridable via entity xlsx upload. In custom mode, expose key constants as editable fields in the UI.

**Why**:
- Hardcoded constants cannot be updated without a code release, even for routine parameter adjustments.
- Country teams may disagree with the default discount rate or growth assumptions.
- Cited sources (World Bank, CLIMADA documentation) embedded in config.json make the scientific basis auditable without reading source code.

**Sources to cite in config**:
- Egypt discount rate 6.89%: [source TBD — confirm with GIZ]
- Thailand discount rate 0.90%: [source TBD]
- Return periods: CLIMADA default event set documentation

**Rejected**:
- **Keep hardcoded**: constants change between country studies; code changes for data is a bad pattern.
- **Config in DuckDB only**: JSON config files are human-readable and diff-able in git; better for scientific auditing.

**Consequence**: `countries/EGY/config.json` and `countries/THA/config.json` are created in Phase 2 (Area 7). All previously hardcoded values removed from `run_scenario.py`.

---

## D15 — Engine hosting: migrate off v1 public repo before v2 public release

**Status**: Accepted  
**Date**: 2026-04-17

**Decision**: The current engine ZIP and download URL in `installer.nsh` and `electron.js` point to releases on the v1 public GitHub repo (`gkalomalos/ERA-Project_RISK-WISE`). Before any public v2 release, move engine hosting to the v2 release pipeline. Update all download URLs. The v1 public repo must not host v2 engine artifacts.

**Why**:
- Hosting v2 artifacts on the v1 public repo makes v2 activity discoverable before the client deal is signed (contradicts D01).
- Engine updates must be signed (D07 + engine-manifest signing in Area 13) — the v1 release infrastructure does not support this.
- Version-locking: the `min_app_version` field in `engine-manifest.json` requires the manifest to be served from the same release pipeline as the app.

**Rejected**:
- **Keep on v1 repo temporarily**: the "temporary" always becomes permanent; migrate before go-live, not after.

**Consequence**: Phase 4 explicit checklist item. `installer.nsh` and `electron.js` updated to v2 release URLs. v1 repo release assets retained for v1 users but no new engine versions published there.

---

## D16 — Loopback HTTP startup handshake: verified, unblocked

**Status**: Accepted (Phase 0 spike complete)
**Date**: 2026-04-17

**Decision**: The FastAPI + uvicorn loopback HTTP architecture (D02) is confirmed viable on Windows 11 Enterprise. The startup handshake works as designed: uvicorn binds to `127.0.0.1:0`, the OS assigns a port, and the ready event `{"type":"event","name":"ready","port":N}` is emitted after the server is fully listening. Phase 1 Areas 1, 2, and 5 are unblocked.

**Findings**:
- `127.0.0.1` loopback traffic bypasses Windows Firewall entirely — it never crosses a network interface, so no enterprise GPO rule or Defender profile applies. No firewall prompts observed.
- Enterprise TLS-inspection proxies (Zscaler, Blue Coat) cannot intercept plain HTTP on loopback. This is an advantage over HTTPS.
- Port 0 binding gives each app instance its own OS-assigned ephemeral port, eliminating hard-coded port collisions across instances.
- SSE (`GET /stream/test`) delivers events correctly over loopback. Manual spot-check: `curl -N http://127.0.0.1:{port}/stream/test`.

**Outstanding**: validation on a machine with a third-party endpoint-protection agent (CrowdStrike, Carbon Black) is tracked by issue #24 (deferred).

**Spike code**: `spike/fastapi-poc/` on branch `spike/fastapi-electron-poc`. 7 automated tests covering `/health` and `/stream/test`, all passing.

---

## D12 — Single ARCHITECTURE.md + DECISIONS.md, not per-decision ADR files

**Status**: Accepted  
**Date**: 2026-04-16

**Decision**: Use two documents — `ARCHITECTURE.md` (what the system looks like and the implementation roadmap) and `docs/decisions.md` (this file, all key decisions) — rather than individual ADR files per decision.

**Why**:
- Project has one primary maintainer. The overhead of separate files per decision is not justified at this scale.
- A single `decisions.md` with `##` sections is easier to scan and maintain.
- Formal per-file ADRs (`docs/adr/0001-...md`) pay off with multiple contributors needing to find decisions quickly, or when decisions need explicit `Superseded` status tracking.

**When to revisit**: if the project gains contributors or if decisions start superseding each other frequently, split into individual files at that point.

---

## D17 — Code signing provider: Azure Trusted Signing primary, SSL.com EV fallback

**Status**: Accepted (cert not yet procured — extends D07)  
**Date**: 2026-04-18

**Decision**: When a signing certificate is procured for RISK WISE Windows installers, use **Azure Trusted Signing** as the primary cloud signing service with an EV-equivalent identity. **SSL.com eSigner + EV** is the fallback if Azure is unavailable. USB hardware tokens and OV certificates are rejected.

**Certificate type — EV over OV**:

| Dimension | OV | EV |
|---|---|---|
| SmartScreen reputation on first install | None — built over hundreds-to-thousands of installs | Immediate |
| Issuance time | 1–5 business days | 1–4 weeks |
| Cost (1-year, USD) | ~$200–$400 | ~$300–$700 |
| CI compatibility | Cloud HSM available | Cloud HSM available; USB-only EV is incompatible with headless CI |

The user base is small (low hundreds, government officials) and will never accumulate enough installs for OV to build SmartScreen reputation. EV is also a soft requirement for some enterprise allowlisting decisions. OV is the fallback only if EV is impossible to procure.

**Cloud signing provider comparison** (USB tokens excluded — incompatible with GitHub Actions):

| Provider | Cert | First-year cost (USD, est.) | SmartScreen day one | electron-builder | Onboarding |
|---|---|---|---|---|---|
| **Azure Trusted Signing** | Microsoft-issued (EV-equivalent, 3-day rotating) | ~$120 (consumption-based, $9.99/mo Basic tier) | Yes | Native via `win.azureSignOptions` | 3–7 business days |
| SSL.com eSigner + EV | SSL.com EV | ~$400–$700 | Yes | `signtoolOptions` + `CodeSignTool` | 5–10 business days |
| DigiCert KeyLocker + EV | DigiCert EV | ~$1,100–$1,400 | Yes | `signtoolOptions` + `smctl` | 5–10 business days |

> Prices are public-list estimates as of 2026-04 and must be re-confirmed with a current quote before purchase. Volume / academic / non-profit pricing may apply, especially via GIZ.

**Why Azure Trusted Signing**:
- Roughly an order of magnitude cheaper than the alternatives at our release volume.
- EV-equivalent SmartScreen reputation from day one — same outcome as a legacy-CA EV cert.
- Native `electron-builder` integration (`win.azureSignOptions`, electron-builder ≥ 24.13) — no extra CLI install in CI, just an Azure service principal.
- Microsoft-issued certs are short-lived (3-day) and rotated automatically — no expiry-day fire drills.

**Rejected**:
- **DigiCert KeyLocker + EV**: same outcome as SSL.com at 2–3× the cost. Justified only if a stakeholder requires a DigiCert-signed binary (none does).
- **Self-signed cert**: same SmartScreen behaviour as unsigned — pointless.
- **Any OV cert**: insufficient install volume for reputation ramp.
- **USB-token EV** (Sectigo / Comodo / GlobalSign default): cannot run headlessly in GitHub Actions.

**Who pays — preference order**:
1. **Client (GIZ / UNU-EHS) pays.** Preferred. Frame as "~$120/year operational cost to remove SmartScreen warning and unblock enterprise allowlisting." Raise in next steering call. The cert is operational infrastructure for distributing the tool to government users, which is exactly what GIZ commissioned.
2. **Maintainer absorbs.** Fallback if client refuses or is slow. Risk: publisher identity becomes the maintainer / their company, which may be objectionable to enterprise IT teams expecting a recognised institution. Recoup later via the eventual commercial deal.
3. **Defer.** Phase 1 ships infrastructure with `CSC_LINK` unset — unsigned builds match today's behaviour. Acceptable for internal beta only; not acceptable for public or government-distributed releases.

**Activation checklist** (referenced by Phase 1 Area 15 and Phase 4 in ARCHITECTURE.md):

Phase 1 (now, no cert needed):
- Add commented signing skeleton to `package.json` (done — `build._signingSkeleton`).
- Document required env vars in `docs/signing.md` when written: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERT_PROFILE_NAME`, `AZURE_ENDPOINT`.
- Add conditional signing step to `.github/workflows/release.yml` guarded by `if: env.AZURE_CLIENT_ID != ''`. Unsigned remains the fallback for forks and dev builds.

Phase 4 (cert procured):
- Provision Azure Trusted Signing identity, complete identity verification, set `publisherName` from the verified publisher.
- Service principal scoped to the signing account; credentials stored as GitHub Actions environment secrets with environment protection rules.
- Cut a release on a test branch and confirm: installer signature valid, SmartScreen does not warn, `electron-updater` validates the update package.
- Remove the `verifySignature = async () => null` monkey-patch from `public/electron.js:261–262` (UPD-1 from `security-baseline.md`).
- Migrate engine hosting to v2 release pipeline (D15) — engines must be signed by the same identity.
- Sign the engine-manifest with an offline minisign/age key (Area 13).

**Consequence**: D07 stands; this entry pins the specific provider and cert type. Action item for the maintainer is to (a) raise Option 1 with GIZ at the next steering call, and (b) verify the Azure Trusted Signing pricing and onboarding process at the point of purchase.

**References**: [Microsoft — Azure Trusted Signing overview](https://learn.microsoft.com/en-us/azure/trusted-signing/overview), [electron-builder — Windows code signing](https://www.electron.build/code-signing-win), [DigiCert KeyLocker](https://www.digicert.com/tls-ssl/code-signing/keylocker), [SSL.com eSigner](https://www.ssl.com/esigner/).

---
