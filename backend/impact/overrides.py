"""Apply an editable-IF override to an entity bundle (#453).

Kept separate from :mod:`backend.run_scenario` so the helper can be
unit-tested without pulling CLIMADA / geopandas through the scenario
handlers' imports. The function works on the engine-side domain types
(:class:`backend.engine.types.EntityBundle`-shaped objects) so the same
code path serves the scenario runner and any future replay path.
"""

from __future__ import annotations

from dataclasses import is_dataclass, replace
from typing import Any

from backend.engine.types import ImpactFunctionSpec


def apply_impact_function_override(entity: Any, override: dict, logger: Any) -> Any:
    """Return ``entity`` with its ``impfset_specs`` patched by ``override``.

    The patch swaps the spec sharing the override's ``haz_type`` (preferring
    the spec whose engine ``id`` matches, then ``exp_type``) so the engine
    resolves the edited curve at run time. The uploaded XLSX is never
    touched — only the in-memory bundle is rewritten — which is the whole
    point of the override flow (DECISIONS D28).
    """
    specs = list(getattr(entity, "impfset_specs", []) or [])
    new_spec = ImpactFunctionSpec(
        haz_type=override["haz_type"],
        exp_type=override["exp_type"],
        id=int(override["id"]),
        name=override["name"],
        intensity_unit=override["intensity_unit"],
        intensity=tuple(float(v) for v in override["intensity"]),
        mdd=tuple(float(v) for v in override["mdd"]),
        paa=tuple(float(v) for v in override["paa"]),
    )

    def _is_match(spec: Any) -> bool:
        if getattr(spec, "haz_type", None) != new_spec.haz_type:
            return False
        # Prefer the same id when the workbook carries multiple specs for
        # the hazard so the engine resolves the override exactly where the
        # original curve was applied. The exp_type comparison is a
        # secondary disambiguator.
        if getattr(spec, "id", None) == new_spec.id:
            return True
        return getattr(spec, "exp_type", None) == new_spec.exp_type

    matched = False
    patched_specs: list[Any] = []
    for spec in specs:
        if not matched and _is_match(spec):
            # Preserve the engine-side id so the exposure rows
            # (``impf_id``) still resolve correctly to the patched curve.
            patched_specs.append(
                ImpactFunctionSpec(
                    haz_type=new_spec.haz_type,
                    exp_type=getattr(spec, "exp_type", new_spec.exp_type),
                    id=getattr(spec, "id", new_spec.id),
                    name=new_spec.name,
                    intensity_unit=new_spec.intensity_unit,
                    intensity=new_spec.intensity,
                    mdd=new_spec.mdd,
                    paa=new_spec.paa,
                )
            )
            matched = True
        else:
            patched_specs.append(spec)
    if not matched:
        logger.warning(
            "impact_function_override did not match any entity spec by hazard; "
            "appending the override so the engine still sees the edited curve."
        )
        patched_specs.append(new_spec)

    if is_dataclass(entity):
        return replace(entity, impfset_specs=patched_specs)
    try:
        entity.impfset_specs = patched_specs
    except AttributeError:
        logger.warning("Could not patch impfset_specs on entity; attribute is read-only.")
    return entity
