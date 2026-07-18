# riskwise-v2

## CI model — on-demand

There is no per-PR or per-push CI in this repo. `tests.yml` runs only when
explicitly invoked:

- `gh workflow run tests.yml --ref main` — the phase gate and the mandatory
  pre-tag gate (dispatch it on the exact commit you intend to tag).
- Adding the `ci` label to a PR — the per-PR opt-in.

Consequences:

- PRs have NO status checks. Merge on `mergeable` — never wait for checks.
- Never tag a commit without a green dispatched `tests.yml` run on that exact
  SHA (release.yml's verify-tests gate enforces this).
