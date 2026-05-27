# Backend Test-Coverage Gap Audit — v1

**Date:** 2026-05-25
**Scope:** Six load-bearing backend modules added since the original epic, called out in [issue #499](https://github.com/CortoMaltese3/riskwise-v2/issues/499) as having no co-located `test_*.py`:

- `backend/cancellation.py`
- `backend/progress.py`
- `backend/provenance.py`
- `backend/cache.py`
- `backend/uploads.py`
- `backend/scenario/strategy.py`

**Audit type:** Pure assessment. No code changes.

---

## Method

For each module:

1. Catalogue testable surface: pure functions, observable side-effects, error paths.
2. Locate existing tests by `grep`ping the test tree for the module name and its public symbols.
3. Match coverage against the catalogue; flag genuine gaps.
4. Recommend: **add tests now**, **acceptable as-is**, or **refactor first**.

The repo's test layout is **not** co-located — all tests live under `tests/unit/` and `tests/integration/` (plus a residual cluster under `backend/test_*.py`). The issue's framing ("no co-located `test_*.py`") therefore reads literally as true for every module in the project; the real question is whether each module has _dedicated_ coverage somewhere, not whether the test file sits next to the source.

---

## Headline finding

**Issue #499's premise is outdated.** Every module in scope has dedicated test coverage as of audit date; the gaps that prompted the issue have already been filled between when #499 was filed and now (post-#496). Verdict for every module is **acceptable as-is**. Two small housekeeping items and one micro coverage gap are worth tracking, but none rises to "add dedicated test file now."

| Module | Testable surface | Existing coverage | Verdict |
|---|---|---|---|
| `cancellation.py` | `check_cancelled` (no-op when flag unset; raises when set); `cancel_event_var` lifecycle | `backend/test_app.py::TestCooperativeCancellation` — 4 tests (unit + integration via `httpx.AsyncClient`) | Acceptable as-is |
| `progress.py` | `update_progress` callback path; logger-fallback path; cancellation checkpoint | `tests/unit/test_base_handler_utils.py::TestUpdateProgress` — 2 tests covering both paths (issue #244 contract) | Acceptable as-is (one micro-gap noted) |
| `provenance.py` | `canonical_json_sha256`, `collect`, `new_random_seed`, `generate_manifest`, `verify_manifest`, manifest skip-flag, DB insert shape | 4 dedicated files under `tests/unit/provenance/` (canonical hash, manifest verify, RNG seeding, provenance insert) | Acceptable as-is |
| `cache.py` | `LRUCache` (eviction, put-update, maxsize); `file_cache_key` (mtime invalidation, missing file); `clear_all` | `tests/unit/test_cache.py` — 7 tests | Acceptable as-is |
| `uploads.py` | `enforce_upload_size_limit` (at cap / over cap / missing / directory); `MAX_UPLOAD_BYTES` constant | `tests/unit/test_uploads.py` — 5 tests | Acceptable as-is |
| `scenario/strategy.py` | `EraDataStrategy`, `CustomDataStrategy` (entity + present-hazard + future-hazard branches; missing-upload error; historical fallback); `make_strategy` factory | `tests/unit/test_scenario_strategy_era.py` (3 test classes) + `tests/unit/test_scenario_strategy_custom.py` (4 test classes) | Acceptable as-is |

---

## Per-module reasoning

### `backend/cancellation.py` — acceptable as-is

33 lines. Surface is two things: a `ContextVar[threading.Event | None]` and `check_cancelled()`.

Covered in `backend/test_app.py`:

- `test_check_cancelled_raises_when_flag_set` — directly exercises the raising branch with a context-bound event.
- `test_check_cancelled_no_op_when_flag_unset` — directly exercises the no-op branch.
- `test_cancel_endpoint_sets_flag_and_aborts_run` — full integration over `httpx.AsyncClient`, hitting `check_cancelled` mid-stage.
- `test_stream_cleanup_sets_cancel_flag` (`TestClientDisconnectCancellation`) — covers the SSE-disconnect path that also sets the flag.

`CancelRequested` inheriting from `BaseException` (so per-stage `except Exception` blocks don't swallow it) is contract-critical but is exercised implicitly by the integration test asserting the run aborts mid-flight. An explicit unit test pinning that subclass relationship would be cheap (one `assert issubclass(CancelRequested, BaseException)`), but it's not load-bearing in the "would a regression go uncaught" sense — any class swap would also break the integration test.

The only mild concern is **organisation, not coverage**: cancellation tests live in `backend/test_app.py` rather than `tests/unit/test_cancellation.py`. Extracting them into a dedicated file would aid discoverability but adds no behavioural assurance. Logged as housekeeping below, not a coverage gap.

### `backend/progress.py` — acceptable as-is

53 lines. Surface: `update_progress(progress, message)` with two branches (SSE callback bound vs. logger fallback) and a cancellation checkpoint inlined at the top.

Covered in `tests/unit/test_base_handler_utils.py::TestUpdateProgress`:

- `test_callback_path_invokes_callback_and_writes_no_stdout` — binds a callback via `progress_callback_var.set(...)`, asserts the dict is delivered and stdout stays empty.
- `test_fallback_path_logs_event_and_writes_no_stdout` — monkeypatches the structured logger, asserts both the JSON event and the legacy breadcrumb land in the logger and stdout stays empty.

Both branches plus the #244 "no `print` calls" contract are pinned.

**Micro-gap:** the cancellation checkpoint inside `update_progress` (line 44, `check_cancelled()` before doing anything else) is not explicitly tested. The integration cancellation test in `backend/test_app.py` exercises it transitively because the runner calls `update_progress` between stages, but no unit test pins "if the cancel flag is set, `update_progress` raises `CancelRequested` before invoking the callback." A single-test addition would close this; it does not warrant a new test file.

Also organisation: the `TestUpdateProgress` class lives in `tests/unit/test_base_handler_utils.py` because progress was originally a `BaseHandler` helper. Now that `progress.py` is its own module, the test class is misplaced. Logged as housekeeping.

### `backend/provenance.py` — acceptable as-is

By far the largest module in scope (~315 lines) and the best-covered. Four dedicated test files under `tests/unit/provenance/`:

- `test_canonical_json_hash.py` — `canonical_json_sha256` stability across float perturbation, key order, container types.
- `test_manifest_verify.py` — happy path, tampered file, missing file, malformed JSON, and the `RISKWISE_SKIP_MANIFEST_VERIFY` bypass.
- `test_rng_seeding.py` — `new_random_seed` bit-width and reproducibility when fed to `numpy.random.default_rng`.
- `test_provenance_insert.py` — `ProvenanceRecord.as_dict` shape and the DB column contract (catches schema drift between dataclass and migrations).

Additional indirect coverage in `tests/determinism/test_scenario_bit_identical.py` and `tests/unit/extensibility/test_scenario_provenance.py`.

The module's public surface (canonical hashing, manifest round-trip, the `ProvenanceRecord` dataclass, `collect`) is fully exercised. The `app_version()` fallback branch (frozen bundle with no package metadata) is not explicitly tested, but it's three lines and a `try/except PackageNotFoundError` — out of scope for the cost-benefit threshold of "new test file".

### `backend/cache.py` — acceptable as-is

116 lines. `tests/unit/test_cache.py` has 7 tests covering:

- LRU eviction drops the oldest entry.
- `maxsize=9` evicts oldest (regression check for off-by-one).
- `put` on an existing key updates rather than appends.
- `maxsize <= 0` raises.
- `file_cache_key` changes when mtime changes.
- `file_cache_key` is total for missing files.
- `clear` empties the store.

Thread-safety (the `RLock`) isn't explicitly stress-tested. That's a reasonable omission — the cache wraps an `OrderedDict` under a lock; a concurrency test would be expensive and flaky for a pattern this conventional. The module's invariants are tested at the API level, which is where regressions would land.

### `backend/uploads.py` — acceptable as-is

Smallest in scope (~70 lines, one function). `tests/unit/test_uploads.py` has 5 tests covering:

- `MAX_UPLOAD_BYTES` is exactly 50 MiB.
- File at the cap is accepted.
- File one byte over the cap is rejected.
- Missing path is tolerated (downstream "file not found" diagnostics win).
- Directory path is tolerated.

That's every branch the function has. Done.

### `backend/scenario/strategy.py` — acceptable as-is

`tests/unit/test_scenario_strategy_era.py` (116 lines, 3 test classes) covers the ERA strategy's three load methods with mocked handlers — assertions on the filename derivation, the `replace(hazard, intensity_unit=...)` step, and the message-text overrides.

`tests/unit/test_scenario_strategy_custom.py` (184 lines, 4 test classes) covers the custom strategy with **more** rigour: the `entity_filename`/`hazard_filename` happy paths, the missing-upload `ValueError`, the historical-vs-future branching, the `check_file_type` source pass-through, and the `make_strategy(is_era=...)` factory.

These are the two test files most clearly written _to_ the strategy contract (rather than discovered via integration). No coverage gap.

---

## Cross-cutting observations

1. **Discoverability over coverage.** The real friction now is finding tests, not the absence of them. Two modules' tests live in unexpected files (`cancellation` in `backend/test_app.py`, `progress` in `tests/unit/test_base_handler_utils.py`). A future housekeeping pass could extract them. This does not block anything.

2. **`backend/test_*.py` vs `tests/unit/*`.** The repo has a partial migration from co-located backend tests (`backend/test_app.py`, `backend/test_main.py`, etc.) to the centralised `tests/unit/` layout. Finishing that migration would simplify the next reviewer's mental map but is out of scope here and is already implied work for any later test-organisation epic.

3. **No "refactor first" verdicts.** Every module in scope is testable today without re-architecting. `cancellation.py` and `progress.py` use `ContextVar` properly, which is the only thing that could have made them awkward to unit-test, and the existing tests use the `set`/`reset(token)` pattern correctly.

---

## Recommendations

- **No new dedicated test files required for #499.** Close as "verified — coverage already present."
- **Optional housekeeping (low priority):**
  - Extract cancellation tests from `backend/test_app.py` into `tests/unit/test_cancellation.py`.
  - Extract `TestUpdateProgress` from `tests/unit/test_base_handler_utils.py` into `tests/unit/test_progress.py`.
  - Add one unit test pinning "`update_progress` raises `CancelRequested` when the cancel flag is set before the callback is invoked."

These three items are folded into a single follow-up issue rather than three; the diff is small and the work is one focused PR. Filed as [#509](https://github.com/CortoMaltese3/riskwise-v2/issues/509).

---

## Out of scope

- Writing or extracting any of the tests themselves — handled by the follow-up issue.
- Refactoring any module to make it more testable — none needs it.
- Auditing test _quality_ (e.g. property tests, mutation testing) — only test _presence_ was in scope.
