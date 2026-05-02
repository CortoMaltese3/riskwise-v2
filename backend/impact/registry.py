"""Impact-function registry loaded from per-country JSON config files.

Replaces the v1 if/elif chain in ``impact_handler.py`` with a data-driven
lookup that validates scientific invariants at load time. The aim is to
catch silent violations once (at startup) instead of letting them creep
into the compute hot path, and to make the addition of a new impact
function a JSON edit rather than a Python edit.

Validations enforced when the registry is constructed
-----------------------------------------------------
* **Intensity monotonicity** — ``mdd`` and ``paa`` arrays must be
  monotonic with intensity. The check accepts either direction
  (non-decreasing OR non-increasing) but rejects oscillation. This is
  the right shape because hazards differ in convention: flood depth
  grows damage as intensity increases, but drought damage *decreases*
  as SPI rises (drier = more negative SPI = worse).
* **Unit consistency** — every entry sharing a ``haz_type`` must
  declare the same ``intensity_unit``. The hazard object's intensity
  unit is a property of the hazard type (e.g., flood depth is in
  metres, drought in SPI), so two impact functions for ``"FL"`` cannot
  legally be in different units.
* **ID uniqueness** — no two entries may share the same
  ``(haz_type, exp_type, id)`` triple across the merged registry.
* **Lookup uniqueness** — no two entries may share the same
  ``(exp_type, haz_type)`` pair, since lookup happens on that pair.

Any violation raises :class:`ImpactFunctionRegistryError` with the
offending entry named so startup aborts cleanly rather than running
with bad data.

JSON schema (one file per country at ``countries/<ISO3>/impact_functions.json``)
-------------------------------------------------------------------------------
The file is a JSON array of objects. Each object has these fields:

================  ============================================================
Field             Description
================  ============================================================
``haz_type``      CLIMADA hazard code (e.g. ``"FL"``, ``"D"``).
``exp_type``      Exposure type identifier matching ``request_data.exposure_type``.
``id``            Non-negative integer impact-function id.
``name``          Human-readable label.
``intensity_unit``  Unit of the hazard intensity values (e.g. ``"m"``, ``"SPI"``).
``intensity``     Strictly non-decreasing list of intensity samples.
``mdd``           Mean Damage Degree at each sample. Must be monotonic.
``paa``           Percentage of Affected Assets at each sample. Must be monotonic.
================  ============================================================

Adding a new impact function is a one-file change:

    [
      ...
      {
        "haz_type": "FL",
        "exp_type": "schools",
        "id": 110,
        "name": "Schools",
        "intensity_unit": "m",
        "intensity": [0.0, 0.5, 1.0, 2.0],
        "mdd": [0.0, 0.2, 0.6, 1.0],
        "paa": [1.0, 1.0, 1.0, 1.0]
      }
    ]

Restart the process and the registry picks it up.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ImpactFunctionRegistryError(Exception):
    """Raised when an impact-function JSON file is missing, malformed, or
    fails one of the registry's scientific-invariant checks."""


@dataclass(frozen=True)
class ImpactFunctionSpec:
    """Validated, in-memory view of one impact-function row."""

    haz_type: str
    exp_type: str
    id: int
    name: str
    intensity_unit: str
    intensity: tuple[float, ...]
    mdd: tuple[float, ...]
    paa: tuple[float, ...]


_REQUIRED_FIELDS: tuple[str, ...] = (
    "haz_type",
    "exp_type",
    "id",
    "name",
    "intensity_unit",
    "intensity",
    "mdd",
    "paa",
)


class ImpactFunctionRegistry:
    """In-memory registry of impact functions, keyed by ``(exp_type, haz_type)``.

    Construction performs all validation. Lookups are O(1) dict reads
    and return the same cached engine ``ImpactFunc`` instance for
    repeated calls with the same key, so callers can rely on identity
    for caching downstream.
    """

    def __init__(self, specs: Iterable[ImpactFunctionSpec]) -> None:
        self._specs: dict[tuple[str, str], ImpactFunctionSpec] = {}
        # Engine ``ImpactFunc`` instances are built lazily on first
        # ``get()`` so callers that only inspect specs (tests,
        # validators) don't pull the engine into memory eagerly.
        self._functions: dict[tuple[str, str], Any] = {}
        triples: dict[tuple[str, str, int], str] = {}
        units_by_haz: dict[str, tuple[str, str]] = {}

        for spec in specs:
            self._check_monotonic(spec.intensity, "intensity", spec, strictly_non_decreasing=True)
            self._check_monotonic(spec.mdd, "mdd", spec)
            self._check_monotonic(spec.paa, "paa", spec)

            triple = (spec.haz_type, spec.exp_type, spec.id)
            if triple in triples:
                raise ImpactFunctionRegistryError(
                    f"Duplicate impact-function id: triple "
                    f"(haz_type={spec.haz_type!r}, exp_type={spec.exp_type!r}, "
                    f"id={spec.id}) appears in entries {triples[triple]!r} and "
                    f"{spec.name!r}. Each (haz_type, exp_type, id) must be unique."
                )
            triples[triple] = spec.name

            seen = units_by_haz.get(spec.haz_type)
            if seen is not None and seen[0] != spec.intensity_unit:
                first_unit, first_name = seen
                raise ImpactFunctionRegistryError(
                    f"Inconsistent intensity_unit for haz_type {spec.haz_type!r}: "
                    f"entry {first_name!r} declares {first_unit!r} but entry "
                    f"{spec.name!r} declares {spec.intensity_unit!r}. All functions "
                    f"sharing a haz_type must use the same unit."
                )
            units_by_haz[spec.haz_type] = (spec.intensity_unit, spec.name)

            key = (spec.exp_type, spec.haz_type)
            if key in self._specs:
                raise ImpactFunctionRegistryError(
                    f"Multiple impact functions registered for "
                    f"(exp_type={spec.exp_type!r}, haz_type={spec.haz_type!r}). "
                    f"Lookup must be unambiguous; pick one definition."
                )
            self._specs[key] = spec

    @staticmethod
    def _check_monotonic(
        values: tuple[float, ...],
        field: str,
        spec: ImpactFunctionSpec,
        strictly_non_decreasing: bool = False,
    ) -> None:
        if len(values) < 2:
            return
        if strictly_non_decreasing:
            if not all(b >= a for a, b in zip(values, values[1:], strict=False)):
                raise ImpactFunctionRegistryError(
                    f"Impact function ({spec.exp_type!r}/{spec.haz_type!r}/{spec.id}): "
                    f"{field!r} must be non-decreasing, got {list(values)!r}."
                )
            return
        non_dec = all(b >= a for a, b in zip(values, values[1:], strict=False))
        non_inc = all(b <= a for a, b in zip(values, values[1:], strict=False))
        if not (non_dec or non_inc):
            raise ImpactFunctionRegistryError(
                f"Impact function ({spec.exp_type!r}/{spec.haz_type!r}/{spec.id}): "
                f"{field!r} must be monotonic with intensity (either non-decreasing "
                f"or non-increasing), got {list(values)!r}."
            )

    def get(self, exp_type: str, haz_type: str) -> Any:
        """Return the cached engine ``ImpactFunc`` for the given pair.

        Raises :class:`ImpactFunctionRegistryError` if no entry matches.
        """
        key = (exp_type, haz_type)
        cached = self._functions.get(key)
        if cached is not None:
            return cached
        spec = self._specs.get(key)
        if spec is None:
            raise ImpactFunctionRegistryError(
                f"No impact function registered for (exp_type={exp_type!r}, haz_type={haz_type!r})."
            )
        built = _build_impact_func(spec)
        self._functions[key] = built
        return built

    def get_set(self, exp_type: str, haz_type: str) -> Any:
        """Return an engine ``ImpactFuncSet`` containing the function for the given pair."""
        spec = self.get_spec(exp_type, haz_type)
        from backend.engine.adapter import build_impfset

        return build_impfset([spec])

    def get_spec(self, exp_type: str, haz_type: str) -> ImpactFunctionSpec:
        """Return the validated spec object — useful for tests/introspection."""
        try:
            return self._specs[(exp_type, haz_type)]
        except KeyError as exc:
            raise ImpactFunctionRegistryError(
                f"No impact function registered for (exp_type={exp_type!r}, haz_type={haz_type!r})."
            ) from exc

    def __contains__(self, key: tuple[str, str]) -> bool:
        return key in self._specs

    def __len__(self) -> int:
        return len(self._specs)

    def specs(self) -> tuple[ImpactFunctionSpec, ...]:
        """Return all registered specs in insertion order."""
        return tuple(self._specs.values())


def load_country_registry(
    country_codes: Iterable[str],
    base_dir: Path | None = None,
) -> ImpactFunctionRegistry:
    """Load and merge impact-function specs from per-country JSON files.

    Missing files contribute zero entries silently — that's the contract
    for countries which have no custom impact functions yet (the lookup
    will then raise on access, naming the missing pair).
    """
    root = base_dir if base_dir is not None else _default_root()
    specs: list[ImpactFunctionSpec] = []
    for code in country_codes:
        iso3 = str(code).upper()
        path = root / iso3 / "impact_functions.json"
        if not path.is_file():
            continue
        specs.extend(_parse_file(path, iso3))
    return ImpactFunctionRegistry(specs)


def load_registry_from_paths(
    sources: Iterable[tuple[str, Path]],
) -> ImpactFunctionRegistry:
    """Load an :class:`ImpactFunctionRegistry` from explicit ``(iso3, path)`` pairs.

    This is the entry point the extensibility layer uses so built-in and
    custom ``impact_functions.json`` files (which live under different
    roots) can be merged into a single registry. ID-uniqueness and
    unit-consistency validation runs across the merged spec list — a
    custom drop-in that reuses a built-in ``(haz_type, exp_type, id)``
    triple is rejected at startup rather than shadowing silently.
    """
    specs: list[ImpactFunctionSpec] = []
    for iso3, path in sources:
        specs.extend(_parse_file(path, iso3))
    return ImpactFunctionRegistry(specs)


def _parse_file(path: Path, iso3: str) -> list[ImpactFunctionSpec]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ImpactFunctionRegistryError(
            f"Impact functions file for '{iso3}' at {path} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(raw, list):
        raise ImpactFunctionRegistryError(
            f"Impact functions file for '{iso3}' at {path} must be a JSON array, "
            f"got {type(raw).__name__}."
        )
    return [_parse_entry(entry, path, iso3, index) for index, entry in enumerate(raw)]


def _parse_entry(entry: Any, path: Path, iso3: str, index: int) -> ImpactFunctionSpec:
    where = f"'{iso3}' at {path}, entry [{index}]"
    if not isinstance(entry, dict):
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where} must be an object, got {type(entry).__name__}."
        )
    missing = [f for f in _REQUIRED_FIELDS if f not in entry]
    if missing:
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where} missing field(s): {', '.join(missing)}."
        )

    haz_type = _require_str(entry["haz_type"], "haz_type", where)
    exp_type = _require_str(entry["exp_type"], "exp_type", where)
    id_value = entry["id"]
    if isinstance(id_value, bool) or not isinstance(id_value, int) or id_value < 0:
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where}: 'id' must be a non-negative integer, got {id_value!r}."
        )
    name = _require_str(entry["name"], "name", where)
    intensity_unit = _require_str(entry["intensity_unit"], "intensity_unit", where)
    intensity = _require_number_array(entry["intensity"], "intensity", where)
    mdd = _require_number_array(entry["mdd"], "mdd", where)
    paa = _require_number_array(entry["paa"], "paa", where)
    if not (len(intensity) == len(mdd) == len(paa)):
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where} ({exp_type!r}/{haz_type!r}/{id_value}): "
            f"'intensity', 'mdd', and 'paa' must all have the same length, got "
            f"{len(intensity)}, {len(mdd)}, {len(paa)}."
        )
    return ImpactFunctionSpec(
        haz_type=haz_type,
        exp_type=exp_type,
        id=id_value,
        name=name,
        intensity_unit=intensity_unit,
        intensity=intensity,
        mdd=mdd,
        paa=paa,
    )


def _require_str(value: Any, field: str, where: str) -> str:
    if not isinstance(value, str) or not value:
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where}: {field!r} must be a non-empty string, got {value!r}."
        )
    return value


def _require_number_array(value: Any, field: str, where: str) -> tuple[float, ...]:
    if not isinstance(value, list) or not value:
        raise ImpactFunctionRegistryError(
            f"Impact functions for {where}: {field!r} must be a non-empty list of numbers."
        )
    out: list[float] = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise ImpactFunctionRegistryError(
                f"Impact functions for {where}: {field!r} must contain only numbers; got {item!r}."
            )
        out.append(float(item))
    return tuple(out)


def _build_impact_func(spec: ImpactFunctionSpec) -> Any:
    # The adapter is the only module allowed to import climate_lama_engine
    # (see scripts/check_engine_imports.py). Importing lazily also breaks
    # the load-time cycle between this module and backend.engine.types,
    # which re-exports ImpactFunctionSpec from here.
    from backend.engine.adapter import build_impfset

    return build_impfset([spec]).get(spec.id)


def _default_root() -> Path:
    # Use backend.constants so the bundled engine resolves to
    # ``<exe_dir>/countries`` instead of a Nuitka onefile %TEMP% path.
    from backend.constants import COUNTRIES_DIR

    return COUNTRIES_DIR
