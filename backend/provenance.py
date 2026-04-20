"""Scientific-reproducibility primitives (#55).

Three concerns live here so the scenario runner and the FastAPI startup
path can share one implementation:

1. **Provenance collection** — :class:`ProvenanceRecord` + :func:`collect`
   gather the versions, data hashes, config SHA, and random seed that are
   stamped on every persisted scenario row.
2. **Canonical-form hashing** — :func:`canonical_json_sha256` computes a
   SHA-256 on a JSON canonical form (sorted keys, fixed decimal precision
   for floats) so result hashes are stable across BLAS/CPU differences
   that nudge the last ULP of a float.
3. **Data-manifest verification** — :func:`generate_manifest` /
   :func:`verify_manifest` round-trip the shipped-dataset SHA map used by
   the generator script and the app startup hook.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Float precision used for canonical JSON hashing. Twelve decimals is more
# than IEEE-754 double precision preserves through typical BLAS kernels
# (~15-17 significant digits), so rounding here is a no-op for exact
# results and absorbs just the last-ULP drift from SIMD re-associations.
_FLOAT_PRECISION = 12

_APP_VERSION_FALLBACK = "0.0.0+unknown"
_CLIMADA_VERSION_FALLBACK = "unknown"

# Reproducibility caveat stamped onto the exported scenario payload (and
# surfaced in the PDF export stub). Same-machine determinism is the only
# guarantee we ship today; cross-platform tolerance will land as a later
# non-blocking CI job (see issue #55 "Out of Scope").
REPRODUCIBILITY_NOTE = (
    "Reproducibility: same OS + Python + random seed -> bit-identical "
    "results. Cross-platform numerical agreement is within typical "
    "BLAS/CPU tolerance (~1e-9 relative)."
)

_MANIFEST_SKIP_FLAG = "RISKWISE_SKIP_MANIFEST_VERIFY"


class ManifestError(RuntimeError):
    """Raised when the data manifest is missing, malformed, or fails to verify."""


@dataclass(frozen=True)
class ProvenanceRecord:
    """Immutable view of the provenance fields stamped onto a scenario row."""

    app_version: str
    engine_version: str
    climada_version: str
    entity_data_sha256: str
    hazard_data_sha256: str
    country_config_sha256: str
    config_version: str
    random_seed: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "app_version": self.app_version,
            "engine_version": self.engine_version,
            "climada_version": self.climada_version,
            "entity_data_sha256": self.entity_data_sha256,
            "hazard_data_sha256": self.hazard_data_sha256,
            "country_config_sha256": self.country_config_sha256,
            "config_version": self.config_version,
            "random_seed": self.random_seed,
        }


def app_version() -> str:
    """Return the ``riskwise-backend`` package version, or a fallback.

    A frozen bundle may not expose package metadata at all — returning the
    sentinel keeps the provenance field populated instead of crashing the
    run. Callers can still detect the unknown case by the sentinel value.
    """
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("riskwise-backend")
    except PackageNotFoundError:
        return _APP_VERSION_FALLBACK


def engine_version() -> str:
    """Return the bundled-engine version.

    The engine shares the backend package version today — the split exists
    so a future native engine can report its own version without touching
    the provenance schema.
    """
    return app_version()


def climada_version() -> str:
    """Return the CLIMADA version if installed, otherwise a sentinel."""
    try:
        import climada

        return str(getattr(climada, "__version__", _CLIMADA_VERSION_FALLBACK))
    except ImportError:
        return _CLIMADA_VERSION_FALLBACK


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Return the hex SHA-256 of a file, streamed in 1 MiB chunks."""
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonicalize(value: Any) -> Any:
    """Return a JSON-serialisable value with floats rounded to a fixed decimal.

    The recursion handles dict / list / tuple containers so callers can
    hand in nested scenario payloads without pre-flattening. ``tuple`` is
    normalised to ``list`` so a tuple and a list with identical contents
    hash to the same digest.
    """
    if isinstance(value, float):
        # ``format`` with ``.{n}f`` rounds half-even; reparsing through
        # ``float`` drops trailing zero fluff so the final JSON is stable.
        # Adding ``0.0`` absorbs ``-0.0`` → ``0.0`` because IEEE-754 treats
        # them as equal numerically but JSON serialises them differently.
        return float(f"{value:.{_FLOAT_PRECISION}f}") + 0.0
    if isinstance(value, dict):
        return {str(k): _canonicalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_canonicalize(v) for v in value]
    return value


def canonical_json_sha256(payload: Any) -> str:
    """SHA-256 a payload via a canonical JSON form (sorted keys, fixed floats).

    The canonicalisation makes the hash stable across BLAS vendors, SIMD
    reorderings, and dict insertion order. Use this for any provenance or
    result hash derived from a float-containing structure.
    """
    canonical = _canonicalize(payload)
    encoded = json.dumps(
        canonical,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return sha256_bytes(encoded)


def new_random_seed() -> int:
    """Return a non-negative 63-bit integer suitable as a NumPy seed.

    ``secrets.randbits(63)`` gives a cryptographically-random value that
    fits in DuckDB's ``BIGINT`` without flirting with the signed-int
    boundary. Callers pass the returned seed into
    :func:`numpy.random.default_rng` so every stochastic step is reproducible
    given the seed stored on the scenario row.
    """
    return secrets.randbits(63)


def collect(
    *,
    entity_path: Path | None,
    hazard_path: Path | None,
    country_config_path: Path | None,
    config_version_value: str,
    random_seed: int,
) -> ProvenanceRecord:
    """Build a :class:`ProvenanceRecord` from the inputs of a scenario run.

    ``None`` for any path produces an empty-string SHA — used during legacy
    runs where the artefact is not a single file we can hash. The scenario
    runner is responsible for always passing the paths for new runs so the
    NOT NULL constraint on the DB column is satisfied in practice even
    though the value itself would still be an empty string.
    """
    return ProvenanceRecord(
        app_version=app_version(),
        engine_version=engine_version(),
        climada_version=climada_version(),
        entity_data_sha256=sha256_file(entity_path) if entity_path else "",
        hazard_data_sha256=sha256_file(hazard_path) if hazard_path else "",
        country_config_sha256=(sha256_file(country_config_path) if country_config_path else ""),
        config_version=config_version_value,
        random_seed=random_seed,
    )


# ---------------------------------------------------------------------------
# Data manifest


def generate_manifest(
    roots: Iterable[tuple[Path, Iterable[str]]],
    repo_root: Path,
) -> dict[str, str]:
    """Hash every file matched by the ``(root, patterns)`` pairs.

    Paths in the returned dict are relative to ``repo_root`` with forward
    slashes so the manifest is portable across Windows / POSIX.
    """
    manifest: dict[str, str] = {}
    for root, patterns in roots:
        for pattern in patterns:
            for path in sorted(root.glob(pattern)):
                if not path.is_file():
                    continue
                rel = path.resolve().relative_to(repo_root.resolve())
                manifest[rel.as_posix()] = sha256_file(path)
    return manifest


def load_manifest(manifest_path: Path) -> dict[str, str]:
    try:
        raw = manifest_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ManifestError(f"Manifest file unreadable: {manifest_path}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ManifestError(f"Manifest is not valid JSON: {manifest_path}") from exc
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in data.items()
    ):
        raise ManifestError(f"Manifest must be an object of str->str: {manifest_path}")
    return data


def verify_manifest(manifest_path: Path, repo_root: Path) -> None:
    """Verify every entry in the manifest; raise :class:`ManifestError` on mismatch.

    Set :data:`_MANIFEST_SKIP_FLAG` (``RISKWISE_SKIP_MANIFEST_VERIFY``) to a
    truthy value to short-circuit — intended for tests and dev environments
    that don't ship the full dataset tree. Production startup leaves it unset.
    """
    if os.environ.get(_MANIFEST_SKIP_FLAG):
        return

    manifest = load_manifest(manifest_path)
    mismatches: list[str] = []
    missing: list[str] = []
    for rel_path, expected_sha in manifest.items():
        abs_path = repo_root / rel_path
        if not abs_path.is_file():
            missing.append(rel_path)
            continue
        actual = sha256_file(abs_path)
        if actual != expected_sha:
            mismatches.append(rel_path)

    if missing or mismatches:
        parts: list[str] = []
        if missing:
            parts.append(f"missing files: {sorted(missing)}")
        if mismatches:
            parts.append(f"SHA-256 mismatch: {sorted(mismatches)}")
        raise ManifestError("Data manifest verification failed — " + "; ".join(parts))
