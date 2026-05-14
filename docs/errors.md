# Error-Code Catalogue

Single source of truth for every error code returned by the backend, the
Electron main process, and the renderer. Mirrors the taxonomy declared in
[`ARCHITECTURE.md`](ARCHITECTURE.md#error-code-taxonomy):

| Range       | Domain                |
| ----------- | --------------------- |
| 1000–1999   | IPC / API layer       |
| 2000–2999   | Data validation       |
| 3000–3999   | Computation           |
| 4000–4999   | Output / export       |
| 5000–5999   | Infrastructure        |
| 6000–6999   | CRED / macro pipeline |

Each entry lists:

- **Code** — numeric (preferred) or snake_case identifier emitted on the
  `ErrorResponse.code` field. Stable across releases; renderer code may
  switch on it.
- **Short name** — internal label used in logs and tests.
- **User-facing message template** — what the renderer toast shows. May
  interpolate the request/error ID for support correlation.
- **Suggested action** — what the user (or support) should do next.
- **Log level** — backend log level when the code is emitted.

The backend envelope (`backend/models/errors.py::ErrorResponse`) always
ships `code`, `message`, `detail`, `error_id`, and `request_id`. The
renderer correlates a toast with backend logs via `error_id`.

Two code conventions co-exist:

1. **Numeric codes** (`2000` / `3000` / `4000`) live in
   [`backend/cli/status_codes.py`](../backend/cli/status_codes.py) and are
   emitted by the legacy `run_*.py` script envelope (`{"code": 2000,
   "message": "ok"}`). They follow the range taxonomy above.
2. **Snake_case codes** (`validation_error`, `not_found`, …) are emitted
   by the FastAPI handlers in [`backend/app.py`](../backend/app.py) and
   are raised by the `RiskWiseError` subclasses in
   [`backend/models/errors.py`](../backend/models/errors.py). They are
   stable identifiers the renderer switches on.

Phase-9 hardening will migrate the snake_case codes onto the same numeric
ranges; until then, both forms are documented here and the renderer
treats them as equivalent identifiers.

---

## 1000–1999 — IPC / API layer

Failures at the HTTP boundary or in the Electron ⇄ renderer IPC channel.
Indicates a malformed request, an unknown route, or a transport-level
problem before any handler runs.

| Code              | Short name              | User-facing message                                          | Suggested action                                                                 | Log level |
| ----------------- | ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------- |
| `http_error`      | Generic HTTP failure    | "Request failed (HTTP {status}). Please try again."          | Retry; if persistent, capture diagnostics and contact support.                   | `warning` |
| `not_found`       | Resource not found      | "The requested resource was not found."                      | Verify the selection (country/hazard/dataset) still exists.                      | `info`    |
| `job_conflict`    | Concurrent job rejected | "Another scenario is already running. Wait for it to finish." | Wait for the in-flight run to complete or cancel it before retrying.             | `info`    |
| `backend_unavailable` | Backend not ready       | "Backend service is not available. Try again shortly."       | Wait for the supervisor health probe to recover; restart the app if it persists. | `error`   |

## 2000–2999 — Data validation

Schema-level or domain validation failures. The request was structurally
parseable but the *content* violates an invariant (unknown country,
malformed measure parameters, file format the loader cannot consume).

| Code               | Short name             | User-facing message                                                                   | Suggested action                                                                                          | Log level |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| `2000`             | CLI: success           | _(not an error — emitted by `run_*.py` on success)_                                   | n/a                                                                                                       | `info`    |
| `validation_error` | Pydantic / domain      | "Some inputs are invalid: {detail}. Please review and try again."                     | Inspect `detail` for the failing field; correct the form input or uploaded file.                          | `warning` |
| `data_load`        | Data-load failure      | "Failed to load the required data file. The file may be missing or malformed."        | Re-upload the file; if the file is a built-in asset, run the engine repair from Settings.                 | `warning` |
| `catalog_not_found` | Catalog lookup miss    | "The selected combination is not available in the dataset."                           | Pick a different country/hazard combination, or verify a custom catalog is loaded.                        | `info`    |
| `upload_too_large` | Upload exceeds 50 MB   | "The uploaded file is too large (max 50 MB). Please reduce the file size and retry." | Trim the workbook or compress the GeoTIFF; the 50 MB cap is a zip-bomb mitigation, not a soft preference. | `warning` |

## 3000–3999 — Computation

Failures originating inside CLIMADA, the engine adapter, or a scenario
worker. The user did nothing wrong; the run cannot complete.

| Code              | Short name           | User-facing message                                                                       | Suggested action                                                                                   | Log level |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| `3000`            | CLI: validation error | _(emitted by `run_*.py` when input validation fails — same semantics as `validation_error`)_ | See `validation_error`.                                                                            | `warning` |
| `engine_error`    | Engine failure       | "The scientific engine failed to complete the run. Error ID: {error_id}."                  | Retry; if persistent, export diagnostics and attach them to a support request.                     | `error`   |
| `scenario_error`  | Scenario worker fail | "Scenario run failed: {message}. Error ID: {error_id}."                                    | Inspect the engine log via Help → Show Logs; retry with a smaller country/scenario.                | `error`   |
| `cancelled`       | User cancellation    | "Scenario run was cancelled."                                                              | None — the run was cancelled at the user's request.                                                | `info`    |

## 4000–4999 — Output / export

Failures during persistence, file export, or report generation. The
scenario computed successfully; the artefact write failed.

| Code              | Short name              | User-facing message                                                            | Suggested action                                                                          | Log level |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------- |
| `4000`            | CLI: generic error      | _(legacy `run_*.py` envelope; replaced by `internal_error` over HTTP)_         | See `internal_error`.                                                                     | `error`   |

## 5000–5999 — Infrastructure

Process-level, filesystem, or memory failures. These usually indicate a
broken install or an environmental constraint (low memory, disk full).

| Code                  | Short name             | User-facing message                                                                              | Suggested action                                                                              | Log level |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------- |
| `memory_insufficient` | Memory pre-flight fail | "Not enough free memory to run this scenario (need ~{required}, have {available})."              | Close other apps and retry; or pick a smaller country / shorter time horizon.                 | `warning` |
| `internal_error`      | Unhandled exception    | "An internal error occurred. Error ID: {error_id}."                                              | Export diagnostics (Help → Export Diagnostics) and attach to a support request.               | `error`   |

## 6000–6999 — CRED / macro pipeline

Failures inside the macroeconomic (CRED) ingest and chart pipeline. Most
are user-correctable: the uploaded `.xlsx` does not match the expected
schema or selects a (country, scenario) combination missing from the
dataset.

_No CRED codes are emitted in the current code path yet; this range is
reserved for the Area 23 work (see ARCHITECTURE.md)._

| Code  | Short name             | User-facing message                                                                       | Suggested action                                                                                   | Log level |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| `6001` | CRED schema error      | "The uploaded CRED file does not match the expected schema (column or sheet missing)."    | Compare the upload to the built-in `cred_output.xlsx` template; re-export with the correct sheet.  | `warning` |
| `6002` | Country not in dataset | "The selected country is not present in this CRED dataset."                               | Pick a different country, or upload a CRED dataset that covers it.                                 | `info`    |

---

## Adding a new code

1. Decide which range the failure falls into (1000–6999 — see table above).
2. If snake_case, add a `RiskWiseError` subclass in
   [`backend/models/errors.py`](../backend/models/errors.py) with `code`,
   `http_status`, and a default `message`; raise it from the handler.
3. If numeric, add an enum member to
   [`backend/cli/status_codes.py`](../backend/cli/status_codes.py).
4. Add a row in the matching table above with the user-facing message
   template, suggested action, and log level.
5. Add a test that asserts the response envelope `code` field matches
   (`backend/test_app.py` has examples).
