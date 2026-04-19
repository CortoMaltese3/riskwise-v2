# Git Conventions — Project Overrides

Base rules are in `~/.claude/CLAUDE.md`. This file defines project-specific scopes only.

## Allowed scopes

`api`, `worker`, `core`, `db`, `storage`, `ingest`, `catalog`, `ci`, `docs`, `ui`

Examples:
```
feat(api): add exposure upload endpoint
fix(worker): handle CRS mismatch in engine adapter
chore(ci): add pytest coverage to GitHub Actions
docs: update architecture decision records
```
