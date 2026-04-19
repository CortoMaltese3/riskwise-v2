---
name: development-setup
description: This skill should be used when the user asks to "set up the project", "run the API locally", "start the worker", "install dependencies", "run migrations", "start docker", "upgrade climate-lama-engine", or encounters infrastructure or environment issues (database connection, MinIO, Redis, port conflicts). Covers the full local development workflow and dependency management.
---

# Development Setup

## Local setup (recommended)

Only infrastructure services need Docker. Run the API and worker directly on the host for hot-reload.

```bash
# 1. Start infrastructure only
docker compose up -d postgres redis minio

# 2. Install all dependencies (pulls climate-lama-engine from GitHub automatically)
uv sync --extra dev

# 3. Run database migrations
uv run alembic upgrade head

# 4. Start the API with hot-reload
uv run uvicorn climate_lama.main:app --reload

# 5. Start the compute worker (separate terminal)
uv run celery -A climate_lama.worker.celery_app worker --loglevel=info --queues=compute
```

`climate-lama-engine` is a git dependency in `[worker]` extras — uv pulls it from GitHub automatically. No manual clone needed.

## Full Docker stack

```bash
# Build and run everything (run from inside climate-lama/)
docker compose up --build

# API:           http://localhost:8000
# API docs:      http://localhost:8000/docs
# MinIO console: http://localhost:9001
```

The worker build context is the parent directory so both repos are reachable during the Docker build. Always run `docker compose` from the `climate-lama/` directory.

## Upgrading climate-lama-engine to PyPI

When the engine is published (currently a git dependency):

1. `cd ../climate-lama-engine && uv publish`
2. In `pyproject.toml`, replace the git URL with a version pin:
   ```toml
   worker = [
       "climate-lama-engine>=0.1.0",
       ...
   ]
   ```
3. No Dockerfile or docker-compose.yml changes needed.

## Tracking deferred work

When a conversation produces an "implement later" decision:
- Open a GitHub Issue at https://github.com/CortoMaltese3/climate-lama/issues
- If it's an architectural decision, add a "Follow-up" note in `docs/DECISIONS.md` with the issue number
