# Extending RISK WISE

Phase 2 ships the first external extension point: drop a country pack
under the user-data directory and the backend registers it on next start.
The full extensibility roadmap (custom hazards, custom measures, settings
panel, signed packs) tracks under
[issue #9](https://github.com/CortoMaltese3/riskwise-v2/issues/9).

## Custom country drop-ins (issue #56)

### Where to put the files

RISK WISE scans ``<user-data>/countries/<ISO3>/`` at startup. ``<user-data>``
is picked in this order:

1. ``RISKWISE_USER_DATA_DIR`` (env var) — full override. Tests and ops use
   this to point the engine at an alternate tree. An explicit empty
   string disables scanning.
2. Platform default:
   - Windows: ``%APPDATA%/RISK WISE/user-data``
   - macOS: ``~/Library/Application Support/RISK WISE/user-data``
   - Linux: ``$XDG_DATA_HOME/RISK WISE/user-data`` or
     ``~/.local/share/RISK WISE/user-data``

``<ISO3>`` is the ISO 3166-1 alpha-3 code of the country (case-insensitive).
A single drop-in looks like:

```
<user-data>/countries/KEN/
├── config.json
└── impact_functions.json       # optional
```

### Namespace isolation

Built-in ISO3 codes (``EGY``, ``THA``) are reserved. A custom drop-in that
reuses a built-in code raises
[``ExtensibilityError``](../backend/extensibility/registry.py) at startup
rather than silently shadowing the shipped config. Rename the directory
if you need a custom variant (e.g. ``EG2`` or a non-ISO code).

Every country returned by ``GET /api/v1/countries`` carries a ``source``
field (``"builtin"`` or ``"custom"``) so the frontend can label them
distinctly.

### Schema — `config.json`

Identical to the built-in format (issue #49). See
[``backend/countries/loader.py``](../backend/countries/loader.py) for the
canonical validator.

| Field | Type | Notes |
|---|---|---|
| `config_version` | integer | Bump on breaking changes; loader reads version 1. |
| `country_code` | string | ISO3 (must match the directory name). |
| `country_name` | string | Display name. |
| `discount_rate` | number | Annual discount rate as a fraction (e.g. `0.0689` for 6.89%). |
| `annual_growth_rate` | object | `{exposure_type: rate}`. Negative rates allowed. |
| `return_periods` | object | `{hazard_code: [years, ...]}`. Hazard codes are CLIMADA short codes (`FL`, `D`, `HW`, …); each value is a non-empty list of positive integers. |
| `source_references` | array of strings | Citations for each value. |

A missing or malformed file raises
[``CountryConfigError``](../backend/countries/loader.py) naming the file,
the offending JSON path, and the specific problem — enough for an analyst
to fix it without reading Python source. Other (valid) custom countries
still load; only the invalid one is rejected and surfaced via a warning log
and the API's skipped-entries list.

### Schema — `impact_functions.json` (optional)

A JSON array of entries; same shape as the built-in
[``countries/EGY/impact_functions.json``](../countries/EGY/impact_functions.json).
The loader merges custom functions into the same
[``ImpactFunctionRegistry``](../backend/impact/registry.py) as the
built-ins, so these scientific invariants hold across the **combined**
set:

- Intensity monotonicity (non-decreasing *or* non-increasing `mdd` / `paa`).
- Unit consistency: every entry sharing a `haz_type` must declare the
  same `intensity_unit`.
- ID uniqueness across the merged registry — a custom drop-in cannot
  reuse a built-in ``(haz_type, exp_type, id)`` triple.

### Minimal example — `countries/KEN/config.json`

```json
{
  "config_version": 1,
  "country_code": "KEN",
  "country_name": "Kenya",
  "discount_rate": 0.05,
  "annual_growth_rate": {
    "crops": 0.02
  },
  "return_periods": {
    "FL": [5, 10, 25]
  },
  "source_references": [
    "discount_rate 5% — fictional reference for documentation"
  ]
}
```

For a fuller, production-grade example see the shipped
[``countries/EGY/``](../countries/EGY) and
[``countries/THA/``](../countries/THA) packs.

### Scenario provenance

A run against a custom country records the custom config's
``config_version`` and ``country_config_sha256`` on the scenarios row —
the same fields the built-ins use
([``backend/provenance.py``](../backend/provenance.py)). That ties every
saved scenario to the exact custom config bytes that were on disk when it
ran; re-running later after the analyst edited the pack will surface a
different SHA.

See
[``docs/DECISIONS.md`` § D14](DECISIONS.md#d14--era-scientific-constants-user-adjustable-via-country-configs-and-entity-files)
and
[``docs/ARCHITECTURE.md`` § Area 22](ARCHITECTURE.md#area-22--extensibility-custom-hazards-measures--impact-functions-medium)
for the design rationale.
