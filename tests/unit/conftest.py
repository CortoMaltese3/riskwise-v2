"""Stub the CLIMADA package so pure-function tests don't need the geospatial stack.

The handlers under test (``base_handler.BaseHandler``, ``hazard.hazard_handler``)
import ``climada.*`` at module top. Installing the real package in CI would
pull the entire geospatial dependency tree for tests that only exercise
string munging and a DataFrame bucket-assignment loop. The stubs below stand
in for the handful of names imported at module level; any test that actually
needs CLIMADA behaviour belongs in an integration suite, not here.
"""

from __future__ import annotations

import sys
import types


class _Stub:
    def __init__(self, *_: object, **__: object) -> None:
        pass


def _stub_module(name: str, **attrs: object) -> None:
    """Register a fake module only if the real one is not already importable.

    Skipping the stub when the real package is installed keeps us from
    clobbering genuine attributes (e.g. ``shapely.geometry.Point``) in an
    integration environment that happens to have them installed.
    """
    if name in sys.modules:
        return
    try:
        __import__(name)
    except ImportError:
        mod = types.ModuleType(name)
        for attr, value in attrs.items():
            setattr(mod, attr, value)
        sys.modules[name] = mod


_stub_module("climada")
_stub_module("climada.util")
_stub_module("climada.util.api_client", Client=_Stub)
_stub_module("climada.entity", Entity=_Stub, Exposures=_Stub, ImpactFuncSet=_Stub)
_stub_module("climada.hazard", Hazard=_Stub)
_stub_module("geopandas", GeoDataFrame=_Stub, read_file=lambda *_, **__: None)
_stub_module("shapely")
_stub_module("shapely.geometry", Point=_Stub)
