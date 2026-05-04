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

**Status**: Superseded by [D26](#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20) (2026-04-27). Track A (CLIMADA + Nuitka) shipped for v2.0; Track B (`climate-lama-engine`) was adopted for v2.x in Phase 6 (`climada` removed from runtime deps in #166).
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
- Core compute already runs locally (post-Phase-6, via `climate-lama-engine`; pre-cutover, via CLIMADA). The remaining gaps are: engine download, update checks, and Leaflet tiles. (CLIMADA's Client API was a network dependency before Phase 6; the engine has no equivalent — it does not fetch datasets at runtime.)
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

**Decision**: Target WCAG 2.1 AA compliance. Enforce via `axe-core` in CI (fails on new violations). Document conformance in `docs/reference/accessibility.md`.

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

**Migration status (2026-04-24, issue #117)**: Complete. `public/electron.js`
(`RELEASE_OWNER` / `RELEASE_REPO` and the first-launch engine download),
`installer/installer.nsh`, and `electron-builder.js` (auto-updater
`publish` target) no longer reference the v1 public repo. The engine URL is
driven entirely by the `download_url` field of the signed
`engine-manifest.json` published by `.github/workflows/release.yml`; no
hardcoded engine URL remains in the Electron app. The v1 public repo does
not host v2 engine artifacts.

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

**Spike code**: `spike/fastapi-poc/` — 7 automated tests covering `/health` and `/stream/test`, all passing. Full findings in [`docs/spikes/adr-fastapi-poc.md`](spikes/adr-fastapi-poc.md).

---

## D12 — `docs/` organization: ARCHITECTURE.md + DECISIONS.md at the root, four buckets below

**Status**: Amended (2026-04-25)
**Date**: 2026-04-16

**Decision**: Use two top-level documents — `docs/ARCHITECTURE.md` (what the system looks like and the implementation roadmap) and `docs/DECISIONS.md` (this file, all key decisions) — rather than individual ADR files per decision. Below the root, organize Markdown docs into four lifecycle buckets:

| Folder | Lifecycle | Contents |
|---|---|---|
| `docs/reference/` | Current truth, long-lived | How things work today: `accessibility.md`, `benchmarks.md`, `extending.md`, `signing.md`, `offline.md` |
| `docs/audits/` | Frozen baselines, dated snapshots | One-shot audits: `accessibility-baseline-v1.md`, `security-baseline-v1.md` |
| `docs/spikes/` | Research, design-time | Per-spike findings: `adr-bundling.md`, `adr-fastapi-poc.md`, `adr-autoupdate-ux.md`, `mui-v7-spike-notes.md`, `engine-manifest-schema.json` |
| `docs/plan/` | Phase plans | `phase-0-research-spikes.md` … `phase-5-optional.md` |

**Amendment 2026-04-25**: Renamed `docs/architecture-decisions/` → `docs/spikes/` (its actual content is spike research, not ADRs — ADRs live in this file). Created `docs/reference/` and `docs/audits/`. Suffixed dated baselines with `-v1` to make their historical scope explicit. Added `docs/README.md` as an index. Sphinx scaffolding (`conf.py`, `*.rst`, `Makefile`) was removed; a hosted-docs evaluation lives at issue #136.

**Why**:
- Project has one primary maintainer. The overhead of separate files per decision is not justified at this scale.
- A single `DECISIONS.md` with `##` sections is easier to scan and maintain.
- Spike research docs are longer-form (test outputs, measurements, gap analysis) and clutter `DECISIONS.md` if inlined. A separate folder keeps them findable without splitting the decision record itself.
- Without the four-bucket convention, `docs/` accumulated as a flat heap. Mixed lifecycles (current truth next to dated baselines) made it hard to know what was authoritative.

**Amendment 2026-04-18 rationale**: During Phase 0, spikes #3, #5, and #8 each produced 10–15 kB of findings that were too detailed for a DECISIONS.md entry. The original `docs/architecture-decisions/` folder was the natural home. Issue #20 (pre-flight: resolve ADR output location) is closed by this amendment.

**When to revisit**: if the project gains contributors or decisions start superseding each other frequently, promote to full per-decision ADR files at that point. If a hosted-docs site (issue #136) is published, this organization should map cleanly to its top-level navigation.

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
- Document required env vars in `docs/reference/signing.md` when written: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERT_PROFILE_NAME`, `AZURE_ENDPOINT`.
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

## Secrets table

Every external secret consumed by the v2 release pipeline. Every row has a
named owner and a documented storage location — ARCHITECTURE.md § Secrets
ownership requires an annual review.

| Secret | Purpose | Storage | Required by | Owner |
|---|---|---|---|---|
| `WINDOWS_CERTIFICATE` | Code-signing certificate (Azure Trusted Signing, base64-encoded `.pfx` when procured) | GitHub Actions repo secret | `.github/workflows/release.yml` (electron-builder `CSC_LINK`) | Release maintainer |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the above cert | GitHub Actions repo secret | `.github/workflows/release.yml` (electron-builder `CSC_KEY_PASSWORD`) | Release maintainer |
| `ENGINE_MANIFEST_KEY` | Base64-encoded minisign **private** key (`engine-manifest.key`) for signing `engine-manifest.json` (issue #115, Area 13) | GitHub Actions environment secret with environment protection rules | `.github/workflows/release.yml` `sign-engine-manifest` job → `scripts/sign_manifest.ps1` | Release maintainer |
| `ENGINE_MANIFEST_KEY_PASSWORD` | Password for the minisign private key (empty string allowed for automation keys) | GitHub Actions environment secret | `scripts/sign_manifest.ps1` | Release maintainer |
| `GITHUB_TOKEN` | Release publishing + GitHub Releases API | GitHub Actions default | All release workflows | Platform-provided |

The **public** half of the engine-manifest keypair (`engine-manifest.pub`)
is committed to `resources/engine-manifest.pub` and ships inside the app
bundle so `public/engineManifest.js` can verify a manifest offline.
Generate the keypair with `minisign -G -p engine-manifest.pub -s engine-manifest.key`;
never commit the private half.

---

## D24 — Air-gapped deployment support: deferred until named customer

**Status**: Accepted
**Date**: 2026-04-25

**Decision**: Defer the offline-installer variant and the broader
air-gapped deployment story. The runtime offline toggle, IPC route
guards, MBTiles tile-server scaffold, and signed `.riskwise-pack`
import flow remain in the codebase. The build-pipeline pieces — the
`OFFLINE_INSTALLER=1` branching in `electron-builder.js`, the
`dist:offline` / `publish:offline` npm scripts, and the build-time
import of `public/offlineConstants.js` — were removed.

**Why**:
- No named customer requires it today. Implementing speculatively
  produces the wrong requirements, and the audit guarantees ("offline
  = no network traffic") cannot be verified without a deployment to
  measure them against.
- Engine bundling at install time is impractical with current CLIMADA
  weight: ~750 MB on top of the base installer for a 2.5 GB on-disk
  engine tree. The trigger to revisit will likely co-occur with a
  switch to a leaner engine (climate-lama-engine, slim CLIMADA fork).
- The audit surfaced an offline IPC guard in `public/electron.js`
  protecting `/api/v1/climada-client/` and
  `/api/v1/hazard/fetch-from-client` routes that were never wired up,
  alongside backend fetcher methods reachable only from internal
  scenario flows with no UI toggle to opt out. **Resolved in
  [#135](https://github.com/CortoMaltese3/riskwise-v2/issues/135)
  (Option B — remove)**: the guard, the orphan fetcher methods, and
  the `climada_api` source branch are all gone; custom-data uploads
  are now the only supported path. If online fetches return for a
  named deployment, both the routes and a matching IPC guard must be
  introduced together.
- D09 ("Offline mode: first-class user-selectable option, not the
  default") still stands as the design target. This decision defers
  the *implementation*, not the design.

**Trigger to revisit**: either of —
- A named GIZ / UNU / other gov-NGO deployment that requires the app
  to operate without internet access.
- A switch to a leaner engine that makes installer-time engine
  bundling viable on size grounds.

**Open questions** (carried forward to the implementation issue):
1. Engine pre-stage strategy — installer-bundled, `RISKWISE_ENGINE_DIR`
   env, or IT-pushed `%LOCALAPPDATA%\RiskWiseEngine\`. Depends on
   whether a leaner engine is available by then.
2. UI behavior for CLIMADA-API-dependent controls when offline:
   confirmed → **disable** with tooltip, do not hide.
3. Code signing must be live before this work resumes — an unsigned
   NSIS installer plus an air-gapped audit is an unacceptable
   combination.
4. Tile-pack publishing process — who holds the minisign key, what is
   the rotation cadence, where is the pack hosted.
5. Any future telemetry / Sentry / crash reporting must gate on
   `isOfflineMode()` from day one. Easy to forget.

**Rejected**:
- Implementing speculatively — see "Why" above.
- Removing the runtime offline toggle, MBTiles scaffold, and signed
  pack flow — they are useful in their own right (flaky-network
  resilience, sideloaded data) and removing them costs more than
  keeping them dormant.

**Consequence**: `docs/reference/offline.md` carries a deferred banner. The
implementation work and the discovered mismatches above are tracked in
[GitHub issue #134](https://github.com/CortoMaltese3/riskwise-v2/issues/134).
A separate cleanup issue ([#135](https://github.com/CortoMaltese3/riskwise-v2/issues/135))
addresses the dead IPC guard and the orphan fetcher methods.

---

## D26 — Adopt `climate-lama-engine` as the runtime compute layer (post-v2.0)

**Status**: Accepted; in production. Phase 6 cutover complete — `climate-lama-engine` is the default and only runtime compute backend; `climada==6.1.0` removed from runtime deps in #166.
**Date**: 2026-04-27 (design accepted); cutover landed in Phase 6 (#164 default flip, #166 dep removal).

**Decision**: Replace `climada==6.1.0` with `climate-lama-engine==<cutover-version>` as the runtime compute dependency in Phase 6, after v2.0.0 has tagged on Track A. The cross-project compatibility contract governing the engine, the climate-lama backbone, and riskwise-v2 is captured in [adr-climate-lama-engine-adoption.md §5](../spikes/adr-climate-lama-engine-adoption.md). Implementation work is broken down in [phase-6-engine-migration.md](../plan/phase-6-engine-migration.md) (issues #150–#169).

**Why**:
- Engine v0.4.0 (released 2026-04-20) covers the full risk-assessment surface riskwise needs, including drought and heatwave hazards beyond the river-flood-only scope of engine v0.1 that drove D05's deferral. The capability assessment in [adr-climate-lama-engine-adoption.md §3](../spikes/adr-climate-lama-engine-adoption.md#3-capability-assessment--engine-v040-vs-climada-610-against-riskwise-needs) maps every CLIMADA call site in the backend to its engine equivalent.
- The engine is in production use inside the climate-lama backbone product. riskwise becomes the second consumer; the cross-project contract in §5 of the ADR formalises the obligations between the two.
- Bundle reality: post-Phase-6 single-installer target re-baselines from the original "~50 MB Track B" daydream to ~150–250 MB (vs ~500 MB current). Real reduction; the ERA-data compression follow-up (#175) is a separate further optimisation.
- The Track A path D05 selected (CLIMADA + Nuitka) shipped successfully for v2.0; D26 is not a retraction of that, only the next step.

**Why not earlier**: Engine v0.1 covered only river flood at the time of D05 (2026-04-16); selecting Track B would have blocked drought + heatwave coverage. Engine v0.4.0 closes that gap.

**Trade-offs accepted**: Smaller bundle, simpler dependency tree, easier hazard extensibility — at the cost of writing our own file loaders (HDF5, GeoTIFF, XLSX) and our own dataset catalog (replacing CLIMADA's `Client`). All five rules of the §5 contract apply: hard pins, no consumer-side workarounds, every engine PR ships with backbone-compat + riskwise-compat tests, coordinated releases.

**Trigger to revisit**: any of —
- A parity gap surfaces during Phase 6 Track 4 (#163) that the engine cannot close in a reasonable timeframe (rollback path documented in ADR §11).
- The compatibility contract breaks down in practice — e.g., consumer needs diverge faster than the engine can serve both. The ADR §5.4 coordinated-release rule is the early-warning signal.

**Rejected**:
- **Stay on CLIMADA indefinitely** — D05's bundle and dependency-tree pain were real; engine v0.4.0 makes the alternative viable for the first time.
- **Adopt the engine for v2.0 directly** — would have collided with the v2.0 release timeline. ADR is explicit that Phase 6 follows v2.0.0 tag.

**Supersedes**: [D05](#d05--python-compute-engine-evaluate-before-committing).

**References**:
- [adr-climate-lama-engine-adoption.md](../spikes/adr-climate-lama-engine-adoption.md) — full ADR
- [adr-bundling.md §6](../spikes/adr-bundling.md#6-cross-reference-with-climate_lama_engine-track-b) — bundle-target re-baseline (footnote points here to ADR §7)
- [phase-6-engine-migration.md](../plan/phase-6-engine-migration.md) — execution plan
- [climate-lama-engine v0.4.0 PyPI page](https://pypi.org/project/climate-lama-engine/) — public API source of truth

---

## D25 — Single bundled installer for v2.0; retire two-variant split

**Status**: Accepted
**Date**: 2026-04-27

**Decision**: For v2.0, ship a **single Windows NSIS installer** that
bundles the ERA scenario datasets (`data/`) and downloads the engine
on first launch. Retire the Phase 4 Area 14 commitment to two installer
variants (`Online ≤ 150 MB` + `Offline all-in-one ≤ 900 MB`). The
runtime offline toggle, signed `.riskwise-pack` import, and engine
manifest verification are kept — those are useful regardless of the
installer story.

D24 (air-gapped variant deferred) and D09 (offline mode as a runtime
toggle) are unchanged. This decision narrows the *installer* story; it
does not retract the runtime offline behavior.

**Why**:
- **The "online" target was incompatible with a hard product
  constraint**. ERA scenarios (Egypt + Thailand entity files and
  hazard rasters in `data/`, ~175 MB) must be available at first run —
  every user needs them. Pretending they could be downloaded
  out-of-band on first launch was a design assumption that contradicted
  the product. Discovered when the actual measurement came in at
  293.1 MB against a 150 MB target.
- **The split delivered no user value**. A 150 MB "online" installer
  that pulls a ~1.2 GB engine on first launch shifts when the
  bandwidth gets spent — it does not reduce it. The user-perceived
  weight is `installer + engine` combined; optimizing the installer
  alone never moves that needle.
- **The real lever is engine size**. That is being attacked by Phase 6
  (`climate-lama-engine`, slim CLIMADA fork). Until that lands, no
  amount of installer-variant gymnastics changes the user experience.
  After it lands, single-installer footprint becomes a tractable target
  to re-evaluate without inventing a download flow first.
- **Engineering cost vs benefit**. Implementing first-launch data
  download (signing, retry, "data not ready" UX, hosting, version
  management) is multi-day work that ships zero user-facing value
  given the constraints above. Not a v2.0 priority.

**Trigger to revisit**: any of —
- Phase 6 (`climate-lama-engine`) lands and the combined
  installer + engine size becomes small enough that the v2.0 target
  ("≤ 150 MB online") looks achievable for a single bundled installer.
- A named customer requires the air-gapped variant — that fires the
  D24 trigger as well; the work would be shaped around their
  deployment.
- An XLSX → DuckDB compression pass on the bundled `data/` shows it can
  drop from ~165 MB to a small fraction (tracked separately, see
  Consequence below). If that brings the single installer into the
  150 MB envelope on its own, the architectural question changes.

**Open questions**:
1. Post-Phase-6 size target. The ≤ 150 MB / ≤ 900 MB targets in
   `docs/reference/benchmarks.md` are retired; a single replacement
   target should be set after the lean engine lands and the combined
   weight is measured on reference hardware.
2. Whether to externalize DuckDB / data files outside the install dir
   in v2.x — security (file permissions), multi-user, and update story
   are all open. Not part of this decision; flagged for later.

**Rejected**:
- **Strip `data/` from the bundle and implement first-launch data
  download for v2.0** — this was the path issue #172 proposed before
  the constraint surfaced. Closed as won't-fix; problem statement was
  wrong because ERA data must be present at first run.
- **Run the XLSX → DuckDB compression refactor on the v2.0 critical
  path** — promising for installer footprint (loose XLSX files
  compressed into a single DuckDB file would likely save 60–80 % on
  the 165 MB), but a multi-day refactor that touches every entity
  loader. Tracked separately for v2.1+, not v2.0.
- **Keep the two-variant story but slip the targets** — the targets
  were the only artifact of that design that mattered; without them,
  the split has no operative meaning. Cleaner to retire it.

**Consequence**:
- `docs/plan/phase-4-distribution-and-polish.md` Area 14 row is
  rewritten: runtime offline toggle and signed-pack flow only, no
  more two-installer language.
- `docs/plan/phase-4-distribution-and-polish.md` exit criterion for
  installer size is rewritten as a single measured row marked
  `accept` against an explicit "retired target — see D25" note.
- `docs/reference/benchmarks.md` § v2.0.0 release measurements
  collapses the two installer rows into one.
- Issue [#172](https://github.com/CortoMaltese3/riskwise-v2/issues/172)
  is closed as won't-fix; comment links to this decision.
- The XLSX → DuckDB compression idea is filed as its own
  enhancement-labeled issue (no milestone) so it does not get lost.

---
