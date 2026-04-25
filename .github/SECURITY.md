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
