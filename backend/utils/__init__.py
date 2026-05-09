"""Single-purpose utility modules carved out of the legacy ``BaseHandler``.

Each submodule owns one concern (country lookups, string formatting,
metadata I/O, file-type checks, parquet I/O, filesystem bootstrap, admin
boundary loading, level bucketing). Handlers and ``run_*.py`` scripts
import the specific function they need; nothing should re-aggregate the
old god-object surface here.
"""
