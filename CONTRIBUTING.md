# Contributing to RISK WISE

Thank you for your interest in contributing. This document covers the expectations
and workflow for contributors to the RISK WISE v2 codebase.

---

## Contribution licensing — Developer Certificate of Origin (DCO)

RISK WISE is distributed under the terms of the [LICENSE](LICENSE) file in this
repository. Because this project underpins a government-facing climate-risk tool,
contributions must carry clear intellectual-property provenance before they are
merged.

**Every commit must be signed off under the
[Developer Certificate of Origin 1.1](https://developercertificate.org/)** (the
same mechanism used by the Linux kernel and Node.js projects).

Signing off certifies, on the honour of the committer, that:

1. You wrote the contribution yourself, **or**
2. You have the right to submit it under the open-source license of this
   project, **or**
3. It was provided to you by someone who complied with (1) or (2).

In practice, add the `-s` (sign-off) flag to every commit:

```bash
git commit -s -m "feat(api): add exposure upload endpoint"
```

This appends a line of the form

```
Signed-off-by: Your Name <your.email@example.com>
```

to the commit message. The author identity on the sign-off line must match
`git config user.name` and `user.email`. Pull requests whose commits are missing
the sign-off line will be asked to amend (`git rebase --signoff main`).

No separate CLA document or signature is required for individual contributors.

> Corporate contributors: if your employer requires an explicit contributor
> agreement before you can submit code, please raise it with the maintainers
> in an issue before opening a PR so we can coordinate the paperwork.

---

## Development setup

### Prerequisites

- Python `3.11` (pinned in [`.python-version`](.python-version))
- Node.js `>= 20` (pinned in [`.nvmrc`](.nvmrc)) and npm `>= 10`
- Optional: [`nvm`](https://github.com/nvm-sh/nvm) and
  [`pyenv`](https://github.com/pyenv/pyenv) to respect the version files above.

### First-time setup

```bash
# Python side
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# JS side
nvm use
npm install --legacy-peer-deps
# `npm install` also runs the `prepare` script which invokes husky and
# wires up the pre-commit hook automatically — no extra step needed.
```

See [README.md](README.md) for running the dev server, tests, and the
Electron shell.

### Configuring Sentry locally (optional)

The "Send to Support" button and the continuous crash-reporting toggle in
Settings → Diagnostics are gated on a `SENTRY_DSN` being available at
launch. Packaged builds get the DSN baked in by CI from a GitHub Actions
secret (see [`scripts/write-sentry-dsn.js`](scripts/write-sentry-dsn.js));
for source launches, you can configure your own DSN in a project-local
`.env` file:

```bash
cp .env.example .env
# edit .env and set SENTRY_DSN=https://...
```

`.env` is git-ignored. Both [`scripts/write-sentry-dsn.js`](scripts/write-sentry-dsn.js)
and the unpackaged [`public/electron.js`](public/electron.js) load it via
`dotenv` before reading `process.env.SENTRY_DSN`. With no `.env` present
and no exported variable, Sentry is simply skipped — both diagnostics
flows degrade gracefully and "Send to Support" disables itself with a
"no DSN configured" hint.

---

## Branch naming

Format: `<type>/<issue-number>-<short-description>`

Examples:

- `feat/42-exposure-upload`
- `fix/17-login-error`
- `chore/update-dependencies` (no issue number for purely internal tasks)

`<type>` must be one of the Conventional Commit types listed below.

---

## Commit convention — Conventional Commits

Commit messages follow
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/),
extended by the project's git-conventions rule under
[`.claude/rules/git-conventions.md`](.claude/rules/git-conventions.md).

Format: `type(scope): description`

### Allowed types

`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

### Allowed scopes

`api`, `worker`, `core`, `db`, `storage`, `ingest`, `catalog`, `ci`, `docs`, `ui`

Scope is optional but encouraged when the change is clearly bounded to one layer.

### Rules

- Subject line in imperative mood, no trailing period, **≤ 72 characters**.
- Optional body, separated from the subject by a blank line, describing **what**
  changed and **why** (not how) as bullet points.
- Optional footer with issue references or `BREAKING CHANGE:` annotations,
  separated from the body by a blank line.
- Individual commits on a feature branch do not need an issue reference — the
  branch name carries that context. **Only the final commit on the branch**
  gets a footer keyword: `Resolves #N` (closes the issue) or `Refs #N` (links
  without closing).
- **Breaking changes** must be flagged in the footer with
  `BREAKING CHANGE: <description>` or by adding `!` after the type (e.g.
  `feat(api)!: rewrite exposure endpoint`). `release-please` relies on this to
  trigger major-version bumps.

### Example

```
feat(api): add exposure upload endpoint

- Accept GeoPackage uploads via multipart/form-data
- Persist to DuckDB and return a job id for async processing

Resolves #42
```

---

## Pull request process

1. **One feature / fix per PR.** Keep the diff reviewable.
2. Open the PR against `main`. Fill in
   [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md);
   reference the issue (`Resolves #N` or `Refs #N`).
3. All CI checks must pass:
   - `ruff check`, `ruff format --check`, `mypy`, `pytest` (Python)
   - `npm run lint`, `npm run format:check`, `npm test` (JS)
4. Request at least one review before merging.
5. Squash- or rebase-merge; the PR title becomes the merge commit subject and
   must itself be a valid Conventional Commit — `release-please` reads these to
   build the changelog.

---

## Regenerating NOTICES.txt

`NOTICES.txt` is auto-generated from the project SBOM (`sbom.json`) by
[`scripts/generate_notices.py`](scripts/generate_notices.py). The committed
file is the source of truth for downstream attribution; CI fails the release
job if the regenerated output does not match the checked-in copy.

After bumping a dependency or editing the static-asset table in the script:

```bash
# 1. (CI does this on every tag) regenerate the SBOM with cyclonedx-npm + cyclonedx-py
#    Locally, you can either reuse a prior `sbom.json` or skip this step
#    if you only changed the static-asset block in the script itself.

# 2. Regenerate NOTICES.txt and commit the result.
python scripts/generate_notices.py
git add NOTICES.txt
```

To verify locally that your committed copy matches the SBOM (the same check
CI runs):

```bash
python scripts/generate_notices.py --check
```

Never edit `NOTICES.txt` by hand — the next regeneration will overwrite it.

---

## Tooling & quality gates

- **Ruff** handles Python lint + format (replaces flake8, isort, and black).
  Config: [`pyproject.toml`](pyproject.toml) under `[tool.ruff]`.
- **mypy** runs type checks on the v2 surface; legacy v1 handlers are baselined
  via `[tool.mypy.overrides]` pending rewrite.
- **ESLint v9** (flat config) and **Prettier** cover the React app under
  [`src/`](src/). Configs: [`eslint.config.mjs`](eslint.config.mjs) and
  [`.prettierrc`](.prettierrc).
- **Husky + lint-staged** run Ruff and Prettier on staged files at
  commit time; the commit is blocked if either fails.
- **release-please** (GitHub Action) cuts releases from Conventional Commits
  landing on `main` and maintains [`CHANGELOG.md`](CHANGELOG.md).
- **Engine import boundary**
  ([`scripts/check_engine_imports.py`](scripts/check_engine_imports.py)):
  enforces that `climate_lama_engine` is imported only from
  [`backend/engine/`](backend/engine/). Per
  [DECISIONS.md D26](docs/DECISIONS.md) and
  [adr-climate-lama-engine-adoption.md §5.1 rule 1](docs/spikes/adr-climate-lama-engine-adoption.md),
  `backend/engine/adapter.py` is the single boundary between riskwise and
  the engine library; every other backend module routes through that
  adapter so we have one fix point when the engine API drifts. The CI
  job in `.github/workflows/tests.yml` runs this check; it also runs
  locally as `python scripts/check_engine_imports.py`.

Run the full check set locally before opening a PR:

```bash
# Python
ruff check .
ruff format --check .
mypy
pytest
python scripts/check_engine_imports.py

# JS
npm run lint
npm run format:check
npm test
```

---

## Reporting security vulnerabilities

Do **not** open a public issue for security problems. Use
[GitHub Security Advisories](https://github.com/CortoMaltese3/riskwise-v2/security/advisories/new)
so the report stays private until a fix is available.

---

## Code of Conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to uphold it.
