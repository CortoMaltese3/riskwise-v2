# Security policy

## Supported versions

RISK WISE v2 is in active development. The latest published release on the
`main` branch is the only version that receives security fixes. v1 builds
are end-of-life and will not receive backported patches.

| Version | Supported          |
| ------- | ------------------ |
| v2.x    | :white_check_mark: |
| v1.x    | :x:                |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Report vulnerabilities privately via one of the following channels:

- **GitHub private vulnerability reporting** (preferred):
  <https://github.com/CortoMaltese3/riskwise-v2/security/advisories/new>
- **Email**: `georgios.kalomalos@sword-group.com`

Please include, where possible:

- A description of the vulnerability and the affected component
  (renderer, Electron main, FastAPI backend, packaged installer, etc.).
- Steps to reproduce, ideally with a minimal proof-of-concept.
- Affected version(s) — `app.getVersion()` from the title bar or the
  installer filename is sufficient.
- Your assessment of impact (information disclosure, RCE, privilege
  escalation, denial of service, etc.).

We will acknowledge receipt within **72 hours** and aim to provide an initial
triage assessment within **10 business days**. Critical issues that allow code
execution or unauthenticated data access on user machines are prioritised over
hardening recommendations.

## Disclosure timeline

Our default coordinated-disclosure window is **90 days** from the date of
acknowledged report, extendable by mutual agreement when a fix requires a
release of the bundled Python engine. We will credit reporters in the
release notes unless anonymity is requested.

## Secrets ownership

The following production secrets back the signed release pipeline. Each entry
names the owner-of-record, the system of record where the secret material is
stored, and the break-glass escalation contact who can rotate or re-issue it
if the primary owner is unreachable.

| Secret                                                     | Purpose                                                        | Owner                           | Storage                                           | Break-glass contact     |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- | ----------------------- |
| `CSC_LINK` / Azure Trusted Signing credentials             | Authenticode signing of the Electron installer and engine .exe | Release engineer (G. Kalomalos) | Azure Key Vault + GitHub Actions encrypted secret | Sword Group IT security |
| Sentry DSN (`SENTRY_DSN_RENDERER`, `SENTRY_DSN_MAIN`)      | Opt-in renderer + main-process crash reporting                 | Frontend lead (G. Kalomalos)    | Sentry org settings + GitHub Actions secret       | Sword Group IT security |
| GitHub release token (`GITHUB_TOKEN`, fine-grained PAT)    | Publishing release artifacts and updating `latest*.yml`        | Release engineer (G. Kalomalos) | GitHub Actions (workflow-scoped) + 1Password      | Sword Group IT security |
| Engine manifest minisign key (`ENGINE_MANIFEST_KEY` + pwd) | Signing `engine-manifest.json` so the app trusts engine .exe   | Release engineer (G. Kalomalos) | GitHub Actions encrypted secret + 1Password vault | Sword Group IT security |

Rotation of any row above must be coordinated with the break-glass contact so
the public counterpart (Sentry project key, signing certificate thumbprint,
`resources/engine-manifest.pub`) is updated in lockstep.

## Known accepted risks

The following are documented trade-offs that we have chosen to accept
rather than mitigate. Each one was reviewed and recorded here so future
contributors do not "fix" them without understanding the constraint.

### CSP `style-src 'unsafe-inline'`

The renderer's Content-Security-Policy (defined in `public/electron.js`
and mirrored by the meta tag in `public/index.html`) sets:

```
style-src 'self' 'unsafe-inline'
```

**Why**: MUI's styling layer (Emotion) injects per-component styles into
the DOM at runtime as inline `<style>` tags. Stripping `'unsafe-inline'`
from `style-src` would break every themed component (buttons, dialogs,
the entire surface). MUI/Emotion does not currently support a nonce-
or hash-based CSP for its runtime style injection without bespoke
SSR-style integration that does not apply to a packaged Electron app.

**Mitigations already in place**:

- `script-src 'self'` (no `'unsafe-inline'` / `'unsafe-eval'`) is the
  real XSS-to-RCE gate. An attacker cannot execute injected JavaScript,
  so an inline style cannot be weaponised into code execution.
- `contextIsolation: true` and `nodeIntegration: false` on every
  `BrowserWindow` (`public/electron.js`) prevent a renderer-side
  exploit from reaching Node APIs even if a style-based exfiltration
  were attempted.
- `connect-src` is locked to loopback (`http://127.0.0.1:*` /
  `ws://127.0.0.1:*` / `file:`), so a hypothetical CSS-based exfiltration
  channel has no external endpoint to send data to.
- `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`
  close the other classical injection vectors.

**Residual risk**: CSS-side-channel attacks — using malicious inline
styles to infer DOM contents via attribute selectors and background-image
requests — remain theoretically possible. The `connect-src` and
`img-src` restrictions reduce the bandwidth of any such channel to
loopback and an allow-listed basemap CDN; combined with the absence of
sensitive per-DOM secrets in the renderer (the app is a desktop tool
operating on local files), the practical exploitability is very low.
Revisit if the renderer starts handling credentials or session tokens.

## Out of scope

The following are not considered vulnerabilities under this policy:

- Findings that require an attacker who already has local code execution
  or filesystem write access on the user's machine.
- Reports about dependencies that have a CVE but are not reachable from
  the shipped code paths (please still report — we will track them, just
  with lower priority).
- Issues in third-party services we link to (CLIMADA, GitHub Releases,
  ECMWF). Report those upstream.

## Hardening references

Defensive controls already in place are documented in:

- `public/electron.js` (CSP injection, `webContents-created` handler,
  `BrowserWindow` `webPreferences`)
- `public/preload.js` (allowlisted IPC surface — no generic `on/send`)
- `scripts/apply-electron-fuses.js` (Electron fuses applied at packaging)
- `.github/workflows/tests.yml` (`npm audit` and `pip-audit` jobs)
- `.github/dependabot.yml` (weekly dependency PRs for npm + pip + actions)
