<!--
PR title: use Conventional Commits format.
  type(scope): short description
  e.g. feat(api): add exposure upload endpoint
See CONTRIBUTING.md for the allowed types and scopes.
-->

## Summary

<!-- 1–3 sentences: what changed and why. Link the issue with `Resolves #N` or `Refs #N`. -->

Resolves #

---

## Changes

- <!-- bullet: what changed -->
- <!-- bullet: what changed -->

---

## Test plan

- [ ] `ruff check` and `ruff format --check` pass
- [ ] `mypy` passes
- [ ] `pytest` passes
- [ ] `npm run lint`, `npm run format:check`, and `npm test` pass
- [ ] Tested manually (describe how, if UI/behaviour change)

---

## Checklist

- [ ] Commit messages follow Conventional Commits (`type(scope): description`)
- [ ] Commits are signed off (`git commit -s`) — see the DCO section in CONTRIBUTING.md
- [ ] Docs updated (README / CLAUDE.md / ADRs) if behaviour or architecture changed
- [ ] No new `ruff` / `mypy` / `eslint` violations introduced
- [ ] Breaking changes called out in the PR description and commit footer (`BREAKING CHANGE:`)

---

## Additional context

<!-- Screenshots, logs, migration notes, or anything reviewers need. -->
