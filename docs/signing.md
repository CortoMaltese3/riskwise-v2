# Code Signing — Windows Installers

This document explains how to activate Authenticode signing for RISK WISE
Windows builds once a certificate is available. The infrastructure is already
wired into `package.json` and `.github/workflows/release.yml`; only the CI
secrets and `publisherName` need to change.

Background: [DECISIONS.md D07](DECISIONS.md#d07--code-signing-wire-infrastructure-now-activate-when-cert-available)
and [D17](DECISIONS.md#d17--code-signing-provider-azure-trusted-signing-primary-sslcom-ev-fallback).

---

## Current state (unsigned)

- `CSC_IDENTITY_AUTO_DISCOVERY=false` is set on the unsigned branch of the
  release workflow, so electron-builder never tries to auto-pick a cert from
  the runner's cert store.
- `package.json → build.win` carries the signing config
  (`signingHashAlgorithms`, `signAndEditExecutable`, `publisherName`
  placeholder). These fields are dormant until electron-builder detects a
  signing identity.
- `build.forceCodeSigning` is `false`, so unsigned builds are permitted.
- `public/electron.js` monkey-patches `NsisUpdater.verifySignature` to a no-op
  because electron-updater otherwise refuses updates whose signature chain
  cannot be verified. This patch **must be removed** once signing is activated.

Running `npx electron-builder -w` on a tag with no `CSC_LINK` secret produces
an unsigned installer. SmartScreen warns on first install for every user.

---

## Activation path A — SSL.com eSigner / DigiCert KeyLocker (CSC_LINK)

This is the path the current CI guard implements (`if [ -n "$CSC_LINK" ]`).
Both SSL.com eSigner and DigiCert KeyLocker expose an electron-builder-
compatible signing identity through the standard `CSC_LINK` / `CSC_KEY_PASSWORD`
env vars (typically via a wrapped `signtool` under the hood).

### One-time setup

1. Procure an EV Code Signing certificate from SSL.com or DigiCert. EV is
   required for day-one SmartScreen reputation (see D17).
2. Complete identity verification for the publisher. The verified common name
   becomes the value of `win.publisherName` in `package.json`.
3. Download the PFX / `.p12` bundle (or the cloud-signing shim binary) that
   the provider issues. Never commit this file — base64-encode it and store
   it as the `WINDOWS_CERTIFICATE` secret.
4. Store the cert password as `WINDOWS_CERTIFICATE_PASSWORD`.

### Required GitHub Actions secrets

| Secret | Purpose |
|---|---|
| `WINDOWS_CERTIFICATE` | Base64-encoded PFX/p12 (wired to `CSC_LINK`). |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX passphrase (wired to `CSC_KEY_PASSWORD`). |

Both names are already referenced in [.github/workflows/release.yml](../.github/workflows/release.yml).

### Activation steps

1. Update `build.win.publisherName` in [package.json](../package.json) to the
   verified publisher CN from the certificate (exact match is required or
   electron-builder will warn and Windows will show the wrong publisher in the
   UAC prompt).
2. Populate the two secrets in the `CortoMaltese3/riskwise-v2` repository
   (Settings → Secrets and variables → Actions).
3. Cut a test tag (e.g. `v1.0.9-rc.1`) and verify:
   - `npx signtool verify /pa /v dist/<version>/RiskWiseInstaller-*.exe`
     reports "Successfully verified".
   - SmartScreen does not warn on a fresh Windows VM.
   - electron-updater downloads and installs a new release without tripping
     signature verification (see "Removing the verifySignature patch" below).

---

## Activation path B — Azure Trusted Signing (preferred per D17)

D17 selects Azure Trusted Signing as the primary provider. Switching to it
replaces the `CSC_LINK` guard with an Azure-credential guard and swaps the
electron-builder signing config from PFX-based to `azureSignOptions`-based.

### Required GitHub Actions secrets

| Secret | Purpose |
|---|---|
| `AZURE_TENANT_ID` | Entra tenant housing the service principal. |
| `AZURE_CLIENT_ID` | Service-principal app ID scoped to the signing account. |
| `AZURE_CLIENT_SECRET` | Service-principal secret. |
| `AZURE_CODE_SIGNING_ACCOUNT_NAME` | Trusted Signing account name. |
| `AZURE_CERT_PROFILE_NAME` | Certificate profile inside that account. |
| `AZURE_ENDPOINT` | Region endpoint, e.g. `https://eus.codesigning.azure.net`. |

### electron-builder changes

Replace the `publisherName` placeholder with the verified publisher and add
`azureSignOptions` under `build.win`:

```json
"win": {
  "signingHashAlgorithms": ["sha256"],
  "signAndEditExecutable": true,
  "publisherName": "<verified publisher CN>",
  "azureSignOptions": {
    "publisherName": "<verified publisher CN>",
    "endpoint": "${env.AZURE_ENDPOINT}",
    "certificateProfileName": "${env.AZURE_CERT_PROFILE_NAME}",
    "codeSigningAccountName": "${env.AZURE_CODE_SIGNING_ACCOUNT_NAME}"
  }
}
```

### Workflow change

Swap the shell guard in [.github/workflows/release.yml](../.github/workflows/release.yml)
from `[ -n "$CSC_LINK" ]` to a step with `if: env.AZURE_CLIENT_ID != ''` and
export the six Azure env vars from secrets. Keep the unsigned fallback path
so fork builds and local runs still succeed.

### Verification

1. `signtool verify /pa /v` on the resulting installer.
2. `Get-AuthenticodeSignature` in PowerShell must return `Valid` with the
   expected signer CN.
3. electron-updater must install an update without the `verifySignature`
   monkey-patch.

---

## Removing the `verifySignature` monkey-patch

Once any signing path is active, the patch in
[public/electron.js](../public/electron.js) at the auto-updater configuration
block must be removed:

```js
if (NsisUpdater.prototype.verifySignature) {
  NsisUpdater.prototype.verifySignature = async () => null;
  log.warn("[electron] Signature verification disabled (self-signed certificate)");
}
```

Tracked as UPD-1 in [docs/security-baseline.md](security-baseline.md). Removing
this block is the signal that the app is fully trusting code signing for
update integrity.

---

## What signing covers

electron-builder signs every executable and DLL emitted by the NSIS target
when any of the paths above are active: the installer, the uninstaller, the
update payload (`.exe` + blockmap), and any Windows PE files inside the
bundled `build/`, `backend/`, and `data/` trees. The Python engine downloaded
at runtime from the release channel is **not** covered by this signing path —
it is verified separately via the engine-manifest signature described in
[ARCHITECTURE.md § Area 13](ARCHITECTURE.md#area-13--auto-update--release-channels-high).

## Engine download URL pattern

Per [DECISIONS.md D15](DECISIONS.md#d15--engine-hosting-migrate-off-v1-public-repo-before-v2-public-release),
the Python engine is hosted on the v2 repo's GitHub Releases page. The
`sign-engine-manifest` job in
[.github/workflows/release.yml](../.github/workflows/release.yml) emits a
signed `engine-manifest.json` whose `download_url` follows this pattern:

```
https://github.com/CortoMaltese3/riskwise-v2/releases/download/vX.Y.Z/riskwise-engine.exe
```

`vX.Y.Z` is the release tag that triggered the workflow (`${GITHUB_REF_NAME}`).
The Electron app fetches the manifest, verifies its minisign signature
against the public key bundled at `resources/engine-manifest.pub`, and only
then trusts the embedded `sha256` and `download_url`. There is no hardcoded
fallback URL in the app — a missing or unverifiable manifest fails the
first-launch engine install outright.

---

## Local development

There is no expectation to sign local builds. `npm run dist` sets
`CSC_IDENTITY_AUTO_DISCOVERY=false` and produces an unsigned installer for
smoke-testing. Only the tag-driven release workflow consumes signing secrets.
