---
name: testing
description: This skill should be used when the user asks to "write tests", "add tests for this", "test this function", "set up fixtures", "run the test suite", "check coverage", "debug a failing test", "what should I test here", or any request involving pytest in this project. Provides coverage expectations, fixture patterns, and concrete test examples for the API, core, and worker layers.
---

# Testing

## What must be tested

- **API endpoints** — happy path + all error cases (400, 404, 422, 500, 401)
- **Core business logic** — all public functions in `core/`
- **Model adapters** — CLIMADA integration in `worker/models/`; use small synthetic datasets, not mocks
- **Database repositories** — all CRUD operations in `db/repositories/`

## Coverage expectations

- Minimum **80% coverage** for `core/` and `api/`
- Integration tests required for worker tasks
- Never mock CLIMADA in integration tests — use small synthetic datasets (see `docs/CLIMADA_INTEGRATION.md` for test fixture patterns)

## Test organization

```
tests/
├── conftest.py           # Shared fixtures: DB session, test client, auth headers
├── test_api/             # One file per router (test_exposures.py, test_hazards.py, ...)
├── test_core/            # Unit tests for business logic
├── test_worker/          # Celery task tests (unit + integration)
└── fixtures/             # Static test data files (CSV, GeoJSON, HDF5 samples)
```

## Running tests

```bash
# Unit tests — no infrastructure required
uv run pytest tests/test_core/ tests/test_worker/ -v

# API integration tests — requires PostgreSQL running
uv run pytest tests/test_api/ -v

# Full suite with HTML coverage report
uv run pytest --cov=climate_lama --cov-report=html

# Single test
uv run pytest tests/test_core/test_impact.py::test_ead_calculation -v
```

## Fixture patterns

```python
# tests/conftest.py

@pytest.fixture(scope="session")
async def db_session(engine):
    """Session-scoped DB — shared across the entire test run."""
    async with AsyncSession(engine) as session:
        yield session

@pytest.fixture
async def clean_db(db_session):
    """Function-scoped — rolls back after each mutating test."""
    yield db_session
    await db_session.rollback()

@pytest.fixture
async def client(app):
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

@pytest.fixture
def auth_headers(api_key):
    return {"Authorization": f"Bearer {api_key}"}
```

## API test pattern

```python
async def test_create_exposure_success(client, auth_headers):
    response = await client.post(
        "/v1/exposures",
        json={"name": "Test", "latitude": 37.97, "longitude": 23.73, "value": 1_000_000},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["data"]["id"] is not None

async def test_create_exposure_invalid_coordinates(client, auth_headers):
    response = await client.post(
        "/v1/exposures",
        json={"latitude": 999, "longitude": 23.73, "value": 1_000_000},
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

async def test_unauthenticated_request(client):
    response = await client.post("/v1/exposures", json={})
    assert response.status_code == 401
```

## Worker task test pattern

```python
# Unit: mock the adapter, verify orchestration
def test_impact_task_calls_adapter(mock_climada_adapter):
    result = calculate_impact_task.apply(args=["job-123", ...]).get()
    mock_climada_adapter.calculate_impact.assert_called_once()
    assert result["status"] == "completed"

# Integration: real adapter, small synthetic dataset — no mocking
@pytest.mark.integration
def test_impact_task_end_to_end(small_hazard_fixture, small_exposure_fixture):
    result = calculate_impact_task.apply(
        args=["job-456", small_hazard_fixture, small_exposure_fixture]
    ).get()
    assert result["ead"] > 0
    assert "impact_at_centroid" in result
```

## Core logic test pattern

```python
def test_ead_calculation_with_known_inputs():
    result = calculate_ead(
        event_losses=[100, 500, 1000],
        frequencies=[0.5, 0.1, 0.01],
    )
    expected = 100 * 0.5 + 500 * 0.1 + 1000 * 0.01
    assert abs(result - expected) < 1e-6

def test_ead_calculation_zero_losses():
    assert calculate_ead(event_losses=[0, 0], frequencies=[0.5, 0.5]) == 0.0
```
