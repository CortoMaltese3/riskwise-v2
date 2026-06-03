# Code Signing — Windows Installers and Engine

This document describes how Authenticode signing is wired into the RISK WISE
Windows release pipeline. **Azure Trusted Signing** (per
[DECISIONS.md D17](../DECISIONS.md#d17--code-signing-provider-azure-trusted-signing-primary-sslcom-ev-fallback))
is the activated provider: it issues short-lived leaf certificates from a
Microsoft-operated CA that already has Windows SmartScreen reputation, so
first-install warnings disappear on day one.

Background: [DECISIONS.md D07](../DECISIONS.md#d07--code-signing-wire-infrastructure-now-activate-when-cert-available)
and D17.

---

## What gets signed

Every PE file that ships to users:

| Artifact | Path | Signed by |
|---|---|---|
| Installer | `dist/<version>/RiskWiseInstaller-*.exe` | `electron-builder` via `azureSignOptions` |
| Uninstaller | Embedded in the NSIS installer | `electron-builder` (`signAndEditExecutable: true`) |
| Update payload | `*.exe`, `*.blockmap` emitted alongside `latest*.yml` | `electron-builder` |
| Bundled PE files (e.g. extraResources/engine DLLs) | inside the installer tree | `electron-builder` |
| Python engine onefile | `dist/nuitka/riskwise-engine.exe` | [`scripts/build_engine.ps1`](../../scripts/build_engine.ps1) signtool step |

The engine onefile is a self-extracting executable — signing the outer `.exe`
covers the embedded DLLs it decompresses at runtime. When Nuitka is invoked
without `--onefile`, the signing step also picks up the sibling DLLs under
`dist/nuitka/`.

The engine is also protected out-of-band by the minisign-based
`engine-manifest.json` signature ([ARCHITECTURE.md § Area 13](../ARCHITECTURE.md#area-13--auto-update--release-channels-high))
so the first-launch download path verifies even before Authenticode is
consulted.

---

## Required GitHub Actions secrets

Populate these in the `CortoMaltese3/riskwise-v2` repository under
Settings → Secrets and variables → Actions:

| Secret | Purpose |
|---|---|
| `AZURE_TENANT_ID` | Entra tenant housing the service principal. |
| `AZURE_CLIENT_ID` | Service-principal app ID scoped to the signing account. Presence of this var is the probe that switches builds from unsigned to signed. |
| `AZURE_CLIENT_SECRET` | Service-principal client secret. |
| `AZURE_CODE_SIGNING_ACCOUNT_NAME` | Trusted Signing account name. |
| `AZURE_CERT_PROFILE_NAME` | Certificate profile inside the account. |
| `AZURE_ENDPOINT` | Region endpoint, e.g. `https://eus.codesigning.azure.net`. |
| `AZURE_PUBLISHER_NAME` | Verified publisher CN issued after identity verification. Must match the cert exactly; electron-builder uses this for `publisherName`. |

`AZURE_CLIENT_ID` is the signal bit: both the Electron build job and the
engine build job short-circuit to an unsigned build when it is empty.
This keeps fork builds and PR runs working until the Azure account is
provisioned.

---

## Azure Trusted Signing setup (one-time)

1. Provision an **Azure Trusted Signing** account
   (Azure portal → Trusted Signing → Create).
2. Complete publisher identity verification. The verified common name is
   what ships in `publisherName` / SmartScreen / UAC prompts.
3. Create a **Certificate profile** under the Trusted Signing account.
4. Create an **Entra service principal** (App registration) and grant it
   the `Trusted Signing Certificate Profile Signer` role on the signing
   account. Record the tenant id, app (client) id, and generate a client
   secret.
5. Store all seven values above as GitHub Actions secrets.

No PFX / `.p12` is involved — Azure Trusted Signing issues per-request
short-lived leaf certificates, so there is nothing to rotate manually.

---

## How activation flows through the codebase

`package.json` does not carry the `build` block directly — electron-builder
config lives in [electron-builder.cjs](../../electron-builder.cjs).
The config is a small conditional:

```js
const azureSigningEnabled = Boolean(process.env.AZURE_CLIENT_ID);
const publisherName = process.env.AZURE_PUBLISHER_NAME || undefined;
// ...
win: {
  // ...
  ...(publisherName ? { publisherName } : {}),
  ...(azureSigningEnabled
    ? {
        azureSignOptions: {
          publisherName,
          endpoint: process.env.AZURE_ENDPOINT,
          certificateProfileName: process.env.AZURE_CERT_PROFILE_NAME,
          codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
          azureTenantId: process.env.AZURE_TENANT_ID,
          azureClientId: process.env.AZURE_CLIENT_ID,
          azureClientSecret: process.env.AZURE_CLIENT_SECRET,
        },
      }
    : {}),
}
```

The signing secrets are routed into two workflows:

- The **`build`** job in `.github/workflows/release.yml` (Electron installer)
  sets the Azure env vars and runs `npx electron-builder -w --publish always`.
  When `AZURE_CLIENT_ID` is empty it falls back to
  `CSC_IDENTITY_AUTO_DISCOVERY=false` + unsigned.
- The **`build-engine`** job in
  [`.github/workflows/engine-release.yml`](../../.github/workflows/engine-release.yml)
  (Nuitka) sets the same six Azure env vars (minus `AZURE_PUBLISHER_NAME`,
  which the engine signer does not use) so that
  [`scripts/build_engine.ps1`](../../scripts/build_engine.ps1) can invoke
  `signtool` with `Azure.CodeSigning.Dlib.dll`. As of issue #529 the engine
  builds on its own `engine-v*`-tagged pipeline, not on app tags — see
  [`engine-distribution.md`](engine-distribution.md).

The Electron main process (`public/electron.js`, copied to
`build/electron.js` at build time) enables update-payload signature
verification by letting electron-updater's default
`verifyUpdateCodeSignature` run. The previous monkey-patch
(`NsisUpdater.prototype.verifySignature = async () => null`) is removed.
electron-updater now refuses any update whose Authenticode chain does not
verify against `publisherName`.

> Implementation note: electron-updater exposes
> `verifyUpdateCodeSignature` as a **function** (called with
> `(publisherNames, tempFile)`), not a boolean flag. The activation
> signal is removal of the override, not a literal `= true` assignment —
> assigning `true` would throw `true is not a function` at update
> download time. A log line in `public/electron.js` records that
> verification is active so regressions are easy to spot in field logs.

---

## Verification checklist

Run on every signing rollout — and always on the first signed release.

### On the build runner

1. `signtool verify /pa /v dist/<version>/RiskWiseInstaller-*.exe`
   reports `Successfully verified`. The signer CN matches the verified
   publisher.
2. `signtool verify /pa /v dist/nuitka/riskwise-engine.exe`
   reports the same.
3. `Get-AuthenticodeSignature dist/<version>/*.exe` returns `Valid`.
4. The release workflow logs include `AZURE_CLIENT_ID present — producing
   Azure Trusted Signing build` and `Azure Trusted Signing complete` (for
   the engine job).

### On a clean Windows VM

5. Download the installer from the GitHub release (not a local rebuild).
6. Double-click → SmartScreen **passes immediately** (no "Windows
   protected your PC" warning). The UAC prompt shows the verified
   publisher CN as "Verified publisher", not "Unknown".
7. If SmartScreen still warns on the very first install from a brand-new
   account, Azure Trusted Signing's Microsoft-rooted leaf is supposed to
   carry inherited reputation; a warning here is a flag worth recording in
   the release notes and raising with GIZ / Microsoft support. Do **not**
   ship the release as "SmartScreen-clean" without confirming.
8. Close the app, reopen it, trigger an auto-update check (Settings →
   Check for updates). An update from a previous signed build downloads
   and installs without prompting for signature trust — this confirms
   `verifyUpdateCodeSignature` is working end-to-end.

### On the engine path

9. Run the app, let it download the engine on first launch
   (`%LOCALAPPDATA%\RiskWiseEngine\`). Run `Get-AuthenticodeSignature` on
   `riskwise-engine.exe` → `Valid` with the expected signer.
10. `engine-manifest.json` verification still succeeds (minisign path is
    orthogonal to Authenticode — both must pass).

A failure at any step blocks the release.

---

## Local development

There is no expectation to sign local builds.

- `npm run dist` sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and produces an
  unsigned installer for smoke-testing.
- `./scripts/build_engine.ps1` without `AZURE_CLIENT_ID` prints
  `AZURE_CLIENT_ID not set — skipping Azure Trusted Signing (unsigned
  build)` and exits successfully.

Only the tag-driven release workflow consumes signing secrets.

---

## Deprecated: CSC_LINK / SSL.com eSigner path

The earlier Phase-1 activation path used `CSC_LINK` / `CSC_KEY_PASSWORD`
env vars with a PFX-based certificate from SSL.com or DigiCert (see
D17's fallback clause). That path is no longer wired in
`.github/workflows/release.yml` — the `AZURE_CLIENT_ID` guard replaced it.
If Azure Trusted Signing ever has to be rolled back to a PFX provider,
restore the old `if [ -n "$CSC_LINK" ]` branch, revert
`electron-builder.cjs`'s conditional to set `signtool` options, and
repopulate `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD`.
