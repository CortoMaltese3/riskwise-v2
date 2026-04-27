# Phase 4 — Environment, Distribution & Polish

> **Weeks**: 18–20 (3 weeks)
> **Status**: 🔄 Implementation complete (issues #113–#123 merged); release-readiness verification pending against the v2.0.0 candidate build.
> **Goal**: Ship a lean, signed, auto-updating Windows installer with a first-class offline variant; close the audit items (WCAG, SBOM, signing, provenance); and deliver the hardened test suite that makes every subsequent release defensible.
> **Canonical references**: [ARCHITECTURE.md § Phase 4](../ARCHITECTURE.md#phase-4-environment--polish-weeks-18-20), [DECISIONS.md](../DECISIONS.md) D05, D07, D09, D15, D17
> **Hard predecessor**: [phase-3-ui-overhaul.md](phase-3-ui-overhaul.md) — the UI, workspace, i18n, and accessibility must be baseline-complete before release-hardening work.

---

## Why this phase exists

Phases 1–3 produce a working, beautiful, accessible application; Phase 4 turns it into a shippable product. The Python bundler chosen in Phase 0 finally ships (Area 4). Signing activates. Auto-update runs end-to-end including engine manifests. The offline installer variant exists. E2E tests gate the release. This is the phase that converts "works on the dev machine" into "installable on an air-gapped government laptop with SmartScreen passing".

---

## Prerequisites (from Phase 3)

- [ ] UI overhaul complete — sidebar nav, workspace UI, skeleton loading states, zero `#XXXXXX` hex.
- [ ] Accessibility baseline in place — ARIA, keyboard-only flow, RTL audit, i18n formatters, axe-core in CI.
- [ ] Help + onboarding shipped.
- [ ] Custom-data, CRED, and measures UI panels live.
- [ ] Phase 0 Track A/B decision (Nuitka / PyInstaller / `climate_lama_engine`) finalised in DECISIONS.md D05.
- [ ] Phase 0 signing decision (DECISIONS.md D17 — Azure Trusted Signing primary, SSL.com EV fallback) — provider selected, procurement initiated.

---

## Scope — Areas and their Phase 4 cuts

Full specifications live in [ARCHITECTURE.md](../ARCHITECTURE.md).

| Area | Cut for Phase 4 | Key ARCHITECTURE.md anchor |
|---|---|---|
| **4 — Lean Backend (execute)** | Apply the Phase 0 decision from [`docs/spikes/adr-bundling.md`](../spikes/adr-bundling.md). Produce the final `.exe` (Nuitka or PyInstaller as measured). Verify against the benchmark targets: Egypt flood ERA ≤ 90 s, Thailand heatwave ERA ≤ 120 s, cold start ≤ 5 s. If Track B (`climate_lama_engine`) was chosen, swap the compute engine behind the pluggable interface. | [§ Area 4](../ARCHITECTURE.md#area-4--python-environment-lean-backend-high) |
| **9 — Testing (complete)** | Integration tests against FastAPI endpoints with synthetic datasets. Playwright E2E in Electron mode: launch → select country → run → verify map renders → save → restore. CI gates release on passing tests. Determinism test (same-machine) runs on every PR; cross-platform tolerance test runs as a separate non-blocking job. | [§ Area 9](../ARCHITECTURE.md#area-9--testing-strategy-high) |
| **13 — Auto-Update (complete)** | Full electron-updater flow: `stable` / `beta` / `internal` release channels, tag conventions (`v2.0.1` → stable, `v2.0.1-beta.1` → beta). Differential updates (blockmap). Consent UX (background check every 4 h, "Install on next restart" / "Remind me later", never force-restart). In-app release notes with `## en` / `## ar` / `## th` sections. **Engine manifest** signed with offline key (minisign or age — decided in #8 spike or Phase 3); public verification key ships in app bundle. Resumable engine download via HTTP `Range`; post-extract SHA-256 verification. Rollback option in Settings. Skips all update checks when offline mode is on. | [§ Area 13](../ARCHITECTURE.md#area-13--auto-update--release-channels-high) |
| **14 — Offline Mode** | Single bundled NSIS installer (ERA datasets bundled, engine downloaded on first launch). The two-variant `Online ≤ 150 MB` / `Offline all-in-one ≤ 900 MB` split is retired per [DECISIONS.md D25](../DECISIONS.md#d25--single-bundled-installer-for-v20-retire-two-variant-split); the `Offline all-in-one` variant remains deferred per [D24](../DECISIONS.md#d24--air-gapped-deployment-support-deferred-until-named-customer) (#134). Settings toggle: disables update checks, blocks CLIMADA Client API, switches to local tile provider, disables telemetry. CLIMADA Client degraded-mode banner when API unreachable. Manual `.riskwise-pack` data packs (signed ZIP). Network-call audit against the canonical table in ARCHITECTURE.md § Network Calls Inventory. Status-bar indicator when offline. `docs/reference/offline.md` written. | [§ Area 14](../ARCHITECTURE.md#area-14--offline-mode-medium) |
| **Engine hosting migration** | Engine ZIP and `engine-manifest.json` move off the v1 public GitHub repo to the v2 release pipeline before any public v2 release. Update `installer.nsh` and `electron.js` download URLs. The v1 public repo must not host v2 artifacts. DECISIONS.md D15 is the contract. | [§ D15](../DECISIONS.md) |
| **15 — Code Signing (activate)** | Activate the signing infrastructure from Phase 1. Sign installer, uninstaller, update payloads, Python engine executable, and DLLs. CI guard: `if [ -n "$CSC_LINK" ]` — signed for releases, unsigned fallback for dev. Verify on a clean Windows VM that SmartScreen passes (EV) or the OV reputation path is understood. | [§ Area 15](../ARCHITECTURE.md#area-15--code-signing-high) |
| **16 — Accessibility (audit)** | WCAG 2.1 AA conformance pass. NVDA smoke test: golden-path scenario driven entirely by screen reader. `axe-core` in CI fails the build on new violations. `docs/reference/accessibility.md` conformance statement written. | [§ Area 16](../ARCHITECTURE.md#area-16--accessibility--inclusive-design-high) |
| **17 — Observability (complete)** | "Export Diagnostics" button: ZIP of logs from all three layers + system info + versions + scenario params. No auto-upload. Opt-in Sentry crash reporting (first-launch consent; disabled in offline mode). `docs/privacy.md` written. | [§ Area 17](../ARCHITECTURE.md#area-17--observability-logging--diagnostics-medium-high) |
| **18 — Security (audit)** | CycloneDX / SPDX SBOM generated per release. `NOTICES.txt` auto-generated from SBOM (GADM ODbL + CC BY, OSM tiles, CLIMADA datasets, Inter SIL OFL, all npm + pip deps). Signed `.riskwise-pack` verification wired up. `SECURITY.md` vulnerability-disclosure policy published. Secrets-ownership table documented (`CSC_LINK`, Sentry DSN, GitHub token, minisign key). | [§ Area 18](../ARCHITECTURE.md#area-18--security-hardening-high) |
| **20 — Reproducibility (complete)** | Provenance block in every exported PDF / Excel (BibTeX / APA citation helper). `.riskwise-scenario` export format: shareable ZIP with provenance manifest + parquet + snapshots. Exported reports note the same-machine vs cross-platform tolerance caveat. | [§ Area 20](../ARCHITECTURE.md#area-20--scientific-reproducibility-medium-high) |
| **Final** | i18n audit (every user-visible string in en/ar/th). Performance profiling pass: confirm all benchmark targets in [ARCHITECTURE.md § Performance Benchmark Targets](../ARCHITECTURE.md#performance-benchmark-targets). | — |

---

## Exit criteria

From [ARCHITECTURE.md § Verification Criteria](../ARCHITECTURE.md#verification-criteria-acceptance-tests-per-phase):

- [x] Single bundled installer measured at **293.1 MB** on Windows 11 (`npm run dist`, NSIS, x64). Two-variant split (`Online ≤ 150 MB` / `Offline ≤ 900 MB`) retired per [DECISIONS.md D25](../DECISIONS.md#d25--single-bundled-installer-for-v20-retire-two-variant-split); a single replacement target will be set after Phase 6 (`climate-lama-engine`) lands. See [`docs/reference/benchmarks.md` § v2.0.0 release measurements](../reference/benchmarks.md#v200-release-measurements).
- [x] Playwright E2E passes: launch → Egypt + Flood → run → Leaflet renders → save → restore. _Issue #114, `tests/e2e/golden_path.spec.ts`, gated in `.github/workflows/tests.yml`._
- [x] All 3 languages complete (en, ar, th) on every user-visible screen. _Issue #123, `src/locales/{en,ar,th}.json` enforced by `npm run lint:locales` in CI._
- [ ] Install v2.0.0; release v2.0.1 to beta channel; app detects update, shows consent dialog, installs on restart. _Pending — exercise on first v2.0.0 → v2.0.1-beta.1 cut._
- [ ] Change engine version in `engine-manifest.json`; app prompts for engine re-download and applies it. _Pending — manual verification on v2.0.0 candidate build._
- [ ] Tamper with `engine-manifest.json`; app rejects it with a signature-mismatch error. _Pending — manual verification on v2.0.0 candidate build._
- [x] `engine-manifest.json` and engine ZIP served from v2 release pipeline, not v1 public repo. _Issue #117._
- [ ] Install on airplane-mode Windows VM: app launches, runs Egypt flood scenario, shows clear errors for network actions. _Pending — manual VM verification on v2.0.0 candidate build._
- [x] Enable "Offline mode" in Settings: update checks stop, Leaflet switches to cached tiles, CLIMADA Client blocked. _Issue #116._
- [x] Drop signed `.riskwise-pack` into designated folder → change takes effect after restart. _Issue #116._
- [x] Import `.riskwise-pack` with invalid signature → import fails with clear error. _Issue #120, `tests/unit/test_pack_verifier.py`._
- [ ] Install on clean Windows VM: SmartScreen passes immediately (EV) or reputation path is understood (OV). _Pending — manual VM verification on v2.0.0 candidate build._
- [x] Introduce a known accessibility violation in a branch → CI fails with a clear message. _Issue #121, `npm run lint:contrast` in CI._
- [ ] Start NVDA; complete golden-path scenario flow with no blocker issues. _Pending — NVDA smoke test recorded in [`docs/reference/accessibility.md`](../reference/accessibility.md) once a v2.0.0 candidate build is available._
- [x] "Export Diagnostics" produces a ZIP containing logs from all three layers + version info + scenario state. _Issue #119._
- [x] SBOM attached as a release artifact and lists every dependency. _Issue #120, `sbom.json` at repo root._
- [x] `NOTICES.txt` attached to release; covers all npm + pip deps. _Issue #120, `NOTICES.txt` at repo root._
- [ ] Egypt flood ERA scenario completes in ≤ 90 s on reference hardware (16 GB, 4-core). _Pending — see [`docs/reference/benchmarks.md` § v2.0.0 release measurements](../reference/benchmarks.md#v200-release-measurements)._
- [x] Simulate low memory → app returns error 5002 before starting computation. _Phase 1 Area 2 / `tests/integration`._

---

## Where to start from cold

1. Verify all Phase 3 exit criteria from [phase-3-ui-overhaul.md § Exit criteria](phase-3-ui-overhaul.md#exit-criteria).
2. Verify DECISIONS.md D05 has been updated with Phase 0 measured results (bundler choice + engine track locked).
3. Confirm signing certificate is obtained (Azure Trusted Signing or SSL.com EV per D17) before starting Area 15 activation.
4. Read ARCHITECTURE.md Areas 4, 13, 14 together — they share the release and update pipeline.
5. Start with Area 4 (bundler execution) — it's the longest pole and gates the installer size targets.
6. Phase 4 implementation issues (#113–#123) all merged as of 2026-04-25; remaining exit-criteria items require a v2.0.0 candidate build for VM and reference-hardware verification.
