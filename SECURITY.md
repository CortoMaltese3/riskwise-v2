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

- **GitHub security advisories** (preferred):
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

We will acknowledge receipt within **3 business days** and aim to provide
an initial triage assessment within **10 business days**. Critical issues
that allow code execution or unauthenticated data access on user machines
are prioritised over hardening recommendations.

## Disclosure timeline

Our default coordinated-disclosure window is **90 days** from the date of
acknowledged report, extendable by mutual agreement when a fix requires a
release of the bundled Python engine. We will credit reporters in the
release notes unless anonymity is requested.

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
