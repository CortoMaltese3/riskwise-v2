"""Optional geospatial-stack stubs for pure-function tests.

After #166 the CLIMADA package is gone — handler modules no longer import
``climada.*``. The stubs below now only cover ``geopandas`` / ``shapely`` /
``pycountry`` so unit tests that touch ``backend.utils.*`` (the helpers
carved out of the legacy ``BaseHandler``) can run without the full
geospatial stack on disk.
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


_stub_module("geopandas", GeoDataFrame=_Stub, read_file=lambda *_, **__: None)
_stub_module("shapely")
_stub_module("shapely.geometry", Point=_Stub)
_stub_module("pycountry")


import os as _os  # noqa: E402


def pytest_configure(config) -> None:  # noqa: ARG001
    """Force an isolated user-data scan root for the tests suite.

    Without this, a developer's local ``%APPDATA%/RISK WISE/user-data``
    drop-in would leak into tests that instantiate the extensibility
    registry via its default path. Tests that want a specific scan root
    pass ``user_data_countries_dir=`` explicitly.
    """
    _os.environ.setdefault("RISKWISE_USER_DATA_DIR", "")
