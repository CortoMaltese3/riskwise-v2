"""Re-usable validator for user-edited impact functions (#453).

The XLSX entity loader at :mod:`backend.engine.loaders.xlsx` is deliberately
permissive — production CLIMADA workbooks are non-monotonic in real fixtures
— so it cannot vet a user-edited curve before it reaches the runner. The
JSON registry's :class:`backend.impact.registry.ImpactFunctionRegistry`,
in contrast, enforces the scientific invariants we care about (intensity
monotonicity, unit consistency, mdd/paa monotonicity, id uniqueness).

This module lifts those rules out of the registry's constructor so the same
checks can validate a single user-submitted spec without forcing the caller
to build a one-element registry. The output is a list of structured field
errors that the API layer surfaces verbatim to the editor UI so each
violation can be rendered next to the offending input.

The validator is shape-only: it does not touch the entity workbook or the
hazard. The runner is responsible for confirming that the override matches
the spec it is replacing (same haz_type / exp_type) before patching.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FieldError:
    """One validation failure, addressable to a specific field path.

    ``field`` is a dotted path that the editor uses to highlight the
    offending cell (e.g. ``"intensity[2]"`` for the third intensity sample
    or ``"mdd"`` for whole-array violations). ``code`` is a stable
    snake_case identifier so the renderer can switch on it for i18n; the
    free-form ``message`` is the English fallback.
    """

    field: str
    code: str
    message: str


_REQUIRED_FIELDS: tuple[str, ...] = (
    "id",
    "name",
    "haz_type",
    "exp_type",
    "intensity_unit",
    "intensity",
    "mdd",
    "paa",
)


def validate_impact_function_override(payload: Any) -> list[FieldError]:
    """Return the list of validation errors for ``payload`` (empty == valid).

    The payload mirrors :class:`backend.impact.registry.ImpactFunctionSpec`
    but arrives from the wire as a plain dict. Type checks run before the
    scientific checks so a missing field or a non-numeric value yields a
    targeted error rather than a downstream ``TypeError``.
    """
    errors: list[FieldError] = []

    if not isinstance(payload, dict):
        return [FieldError("", "invalid_payload", "Impact function override must be an object.")]

    for field_name in _REQUIRED_FIELDS:
        if field_name not in payload:
            errors.append(
                FieldError(
                    field_name,
                    "required",
                    f"Field {field_name!r} is required.",
                )
            )
    if errors:
        return errors

    id_value = payload["id"]
    if isinstance(id_value, bool) or not isinstance(id_value, int) or id_value < 0:
        errors.append(
            FieldError("id", "invalid_type", "Field 'id' must be a non-negative integer.")
        )

    for str_field in ("name", "haz_type", "exp_type", "intensity_unit"):
        value = payload[str_field]
        if not isinstance(value, str) or not value:
            errors.append(
                FieldError(
                    str_field,
                    "invalid_type",
                    f"Field {str_field!r} must be a non-empty string.",
                )
            )

    intensity = _coerce_number_array(payload["intensity"], "intensity", errors)
    mdd = _coerce_number_array(payload["mdd"], "mdd", errors)
    paa = _coerce_number_array(payload["paa"], "paa", errors)

    if errors:
        return errors

    if not (len(intensity) == len(mdd) == len(paa)):
        errors.append(
            FieldError(
                "",
                "length_mismatch",
                "Arrays 'intensity', 'mdd', and 'paa' must all have the same length, "
                f"got {len(intensity)}, {len(mdd)}, {len(paa)}.",
            )
        )
        return errors

    _check_intensity_monotonic(intensity, errors)
    _check_curve_monotonic(mdd, "mdd", errors)
    _check_curve_monotonic(paa, "paa", errors)

    return errors


def _coerce_number_array(value: Any, field: str, errors: list[FieldError]) -> list[float]:
    if not isinstance(value, list) or not value:
        errors.append(
            FieldError(
                field,
                "invalid_type",
                f"Field {field!r} must be a non-empty array of numbers.",
            )
        )
        return []
    out: list[float] = []
    for index, item in enumerate(value):
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            errors.append(
                FieldError(
                    f"{field}[{index}]",
                    "invalid_type",
                    f"Element {index} of {field!r} must be a number.",
                )
            )
            return []
        out.append(float(item))
    return out


def _check_intensity_monotonic(values: list[float], errors: list[FieldError]) -> None:
    """Intensity must be non-decreasing — strict registry rule."""
    for index in range(1, len(values)):
        if values[index] < values[index - 1]:
            errors.append(
                FieldError(
                    f"intensity[{index}]",
                    "not_non_decreasing",
                    "Field 'intensity' must be non-decreasing (each value ≥ the previous).",
                )
            )
            return


def _check_curve_monotonic(values: list[float], field: str, errors: list[FieldError]) -> None:
    """``mdd`` / ``paa`` must be monotonic in either direction.

    Either non-decreasing (typical: damage grows with intensity) or
    non-increasing (e.g. drought damage as SPI rises). Oscillation is
    rejected because it has no defensible scientific reading.
    """
    if len(values) < 2:
        return
    non_dec = all(b >= a for a, b in zip(values, values[1:], strict=False))
    non_inc = all(b <= a for a, b in zip(values, values[1:], strict=False))
    if not (non_dec or non_inc):
        errors.append(
            FieldError(
                field,
                "not_monotonic",
                f"Field {field!r} must be monotonic with intensity "
                "(either non-decreasing or non-increasing).",
            )
        )
