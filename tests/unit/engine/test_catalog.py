"""Tests for :mod:`backend.engine.catalog`.

Pins two contracts:

* ``is_dataset_available(country, hazard)`` returns ``True`` for shipped
  ``(country, hazard)`` pairs and ``False`` otherwise. The bundled
  EGY-flood pair is the canonical example called out in the issue.
* ``data/catalog.json`` validates against the JSON Schema in
  ``tests/fixtures/catalog_schema.json``. The schema is checked with a
  small purpose-built validator (no ``jsonschema`` dependency); it
  exercises the subset of Draft-7 keywords the schema actually uses
  (``type``, ``required``, ``properties``, ``additionalProperties``,
  ``items``, ``minimum``, ``pattern``).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from backend.engine.catalog import CatalogError, is_dataset_available, load_catalog

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG_PATH = REPO_ROOT / "data" / "catalog.json"
SCHEMA_PATH = REPO_ROOT / "tests" / "fixtures" / "catalog_schema.json"


@pytest.fixture(autouse=True)
def _reset_catalog_cache():
    """Drop the ``lru_cache`` on :func:`load_catalog` between tests.

    Tests below pass an explicit fixture path to ``load_catalog`` to
    drive ``is_dataset_available`` against a synthetic catalog. The
    cache is keyed on the path argument, so a stale entry from a
    previous test would otherwise leak across cases.
    """
    load_catalog.cache_clear()
    yield
    load_catalog.cache_clear()


class TestIsDatasetAvailable:
    """``is_dataset_available`` returns the expected truth value for a country/hazard."""

    def test_shipped_pair_is_available(self) -> None:
        """EGY/FL is shipped (per ``data/catalog.json``)."""
        assert is_dataset_available("EGY", "FL") is True

    def test_lowercase_inputs_normalise(self) -> None:
        """Inputs are case-normalised so callers can pass mixed case."""
        assert is_dataset_available("egy", "fl") is True

    def test_unshipped_country_is_unavailable(self) -> None:
        """A country we never ship returns ``False``."""
        assert is_dataset_available("USA", "FL") is False

    def test_unshipped_hazard_is_unavailable(self) -> None:
        """A hazard we don't ship for an otherwise-shipped country returns ``False``."""
        assert is_dataset_available("EGY", "D") is False

    def test_returns_false_when_only_hazard_shipped(self, monkeypatch, tmp_path) -> None:
        """A pair with hazard files but no entity files counts as unavailable."""
        synthetic = tmp_path / "catalog.json"
        synthetic.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hazards": [
                        {
                            "country": "EGY",
                            "hazard": "FL",
                            "scenario": "historical",
                            "path": "x.tif",
                        }
                    ],
                    "entities": [],
                    "measures": [],
                }
            )
        )
        monkeypatch.setattr("backend.engine.catalog._CATALOG_PATH", synthetic)
        assert is_dataset_available("EGY", "FL") is False


class TestLoadCatalogErrors:
    """``load_catalog`` raises :class:`CatalogError` on missing/malformed input."""

    def test_missing_file(self, tmp_path) -> None:
        load_catalog.cache_clear()
        with pytest.raises(CatalogError, match="not found"):
            load_catalog(tmp_path / "nope.json")

    def test_invalid_json(self, tmp_path) -> None:
        bad = tmp_path / "catalog.json"
        bad.write_text("{ not json")
        load_catalog.cache_clear()
        with pytest.raises(CatalogError, match="Cannot parse"):
            load_catalog(bad)


class TestCatalogSchema:
    """``data/catalog.json`` matches the schema in ``tests/fixtures/catalog_schema.json``."""

    def test_catalog_validates_against_schema(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors = _validate(catalog, schema, path="$")
        assert errors == [], "Catalog failed schema validation:\n  " + "\n  ".join(errors)

    def test_schema_is_draft7(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        assert schema.get("$schema", "").endswith("draft-07/schema#")


# ---------------------------------------------------------------------------
# Minimal JSON Schema validator (Draft-07 subset)
# ---------------------------------------------------------------------------
#
# The schema this fixture defines uses only ``type``, ``required``,
# ``properties``, ``additionalProperties``, ``items``, ``minimum``, and
# ``pattern``. A purpose-built validator keeps the test suite free of a
# ``jsonschema`` dependency. If the schema later grows, swap this for the
# real library — the shape of the call (``_validate(instance, schema)``
# returning a list of error strings) is intentionally close to
# ``jsonschema.Draft7Validator.iter_errors``.

_TYPE_MAP: dict[str, type | tuple[type, ...]] = {
    "object": dict,
    "array": list,
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "null": type(None),
}


def _validate(instance: Any, schema: Any, path: str) -> list[str]:
    errors: list[str] = []
    expected_type = schema.get("type")
    if expected_type is not None:
        py_type = _TYPE_MAP[expected_type]
        if expected_type == "integer" and isinstance(instance, bool):
            errors.append(f"{path}: expected integer, got boolean")
        elif not isinstance(instance, py_type):
            errors.append(f"{path}: expected {expected_type}, got {type(instance).__name__}")
            return errors

    if expected_type == "object":
        for required in schema.get("required", []):
            if required not in instance:
                errors.append(f"{path}: missing required property {required!r}")
        properties = schema.get("properties", {})
        additional_allowed = schema.get("additionalProperties", True)
        for key, value in instance.items():
            if key in properties:
                errors.extend(_validate(value, properties[key], f"{path}.{key}"))
            elif additional_allowed is False:
                errors.append(f"{path}: unexpected property {key!r}")

    if expected_type == "array":
        item_schema = schema.get("items")
        if item_schema is not None:
            for i, item in enumerate(instance):
                errors.extend(_validate(item, item_schema, f"{path}[{i}]"))

    if expected_type == "integer" and "minimum" in schema and isinstance(instance, int):
        if instance < schema["minimum"]:
            errors.append(f"{path}: {instance} below minimum {schema['minimum']}")

    if expected_type == "string" and "pattern" in schema and isinstance(instance, str):
        if not re.search(schema["pattern"], instance):
            errors.append(f"{path}: {instance!r} does not match pattern {schema['pattern']!r}")

    return errors
