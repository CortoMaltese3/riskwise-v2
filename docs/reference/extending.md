# Extending RISK WISE

Phase 2 ships the first external extension point: drop a country pack
under the user-data directory and the backend registers it on next start.
Phase 3 adds an in-app Settings panel (issue #90) so analysts can
drag-and-drop those ZIP packs without touching the filesystem directly.
The full extensibility roadmap (custom hazards, custom measures, signed
packs) tracks under
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

### Importing via the Settings panel (issue #90)

The **Settings → Custom Data** tab accepts a ZIP archive shaped the same
way as the on-disk layout — so a valid archive contains exactly:

```
my-kenya-pack.zip
└── countries/
    └── KEN/
        ├── config.json
        └── impact_functions.json    # optional
```

Drop the ZIP on the drop zone (or click **Browse for ZIP**) and the
app calls:

1. `POST /api/v1/custom-data/validate` — inspects the archive without
   writing anything, runs the same
   [`load_country_config`](../../backend/countries/loader.py) validator
   used at startup, and reports a list of human-readable errors if
   the pack is malformed.
2. `POST /api/v1/custom-data/import` — on confirmation, extracts the
   archive to `<user-data>/countries/<ISO3>/` (overwriting any prior
   custom pack for that ISO3) and calls
   [`reset_registry()`](../../backend/extensibility/registry.py) so the
   country shows up immediately in the country selector, tagged
   **Custom**. No restart required.

The importer rejects ZIPs that contain absolute paths, `..` traversal,
Windows drive letters, more than one country, or an ISO3 that collides
with a built-in (`EGY`, `THA`). See
[`backend/custom_data_handler.py`](../../backend/custom_data_handler.py)
for the full set of guardrails.

### Namespace isolation

Built-in ISO3 codes (``EGY``, ``THA``) are reserved. A custom drop-in that
reuses a built-in code raises
[``ExtensibilityError``](../../backend/extensibility/registry.py) at startup
rather than silently shadowing the shipped config. Rename the directory
if you need a custom variant (e.g. ``EG2`` or a non-ISO code).

Every country returned by ``GET /api/v1/countries`` carries a ``source``
field (``"builtin"`` or ``"custom"``) so the frontend can label them
distinctly.

### Schema — `config.json`

Identical to the built-in format (issue #49). See
[``backend/countries/loader.py``](../../backend/countries/loader.py) for the
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
[``CountryConfigError``](../../backend/countries/loader.py) naming the file,
the offending JSON path, and the specific problem — enough for an analyst
to fix it without reading Python source. Other (valid) custom countries
still load; only the invalid one is rejected and surfaced via a warning log
and the API's skipped-entries list.

### Schema — `impact_functions.json` (optional)

A JSON array of entries; same shape as the built-in
[``countries/EGY/impact_functions.json``](../../countries/EGY/impact_functions.json).
The loader merges custom functions into the same
[``ImpactFunctionRegistry``](../../backend/impact/registry.py) as the
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

### Canonical annotated example — Egypt

The shipped Egypt pack is the reference implementation. Every field is
cited in `source_references` so a re-opened scenario can be traced back
to the inputs that produced it.

```jsonc
// countries/EGY/config.json
{
  "config_version": 1,                // bump only on breaking schema change
  "country_code": "EGY",              // must match the directory name
  "country_name": "Egypt",            // display label shown in the UI

  // Annual discount rate (fraction, not percent). Used by the net-present-
  // value calculation in the cost-benefit module. 6.89 % ≈ World Bank
  // average lending rate for Egypt, 2023.
  "discount_rate": 0.0689,

  // Per-exposure-type annual growth rate applied to the exposure stock
  // across the scenario horizon. Keys must match the `exposure_type`
  // values your UI and impact functions use. Negative rates are allowed
  // (e.g. population decline).
  "annual_growth_rate": {
    "crops":               0.04,
    "livestock":           0.04,
    "power_plants":        0.04,
    "hotels":              0.04,
    "hospitalised_people": 0.0129,
    "students":            0.0129,
    "diarrhea_patients":   0.0129,
    "roads":               0.0129
  },

  // Return periods CLIMADA will be asked to compute for each hazard.
  // Keys are CLIMADA short codes (FL = flood, D = drought, HW = heatwave).
  // Values must be non-empty lists of positive integers (years).
  "return_periods": {
    "FL": [2, 5, 10, 25],
    "D":  [10, 25, 50, 75, 100],
    "HW": [10, 25, 50, 75, 100]
  },

  // Free-text citations for every non-default value above. Required, and
  // surfaced in reports so reviewers can audit the inputs.
  "source_references": [
    "discount_rate 6.89% — World Bank average lending rate, Egypt, 2023",
    "annual_growth_rate (economic exposures) 4.00% — UNU-EHS ERA default",
    "annual_growth_rate (non-economic exposures) 1.29% — UNU-EHS ERA default",
    "return_periods.FL [2, 5, 10, 25] — UNU-EHS ERA tailored set",
    "return_periods.D / return_periods.HW — CLIMADA default event-set return periods"
  ]
}
```

For the full, un-annotated files see the shipped
[`countries/EGY/`](../../countries/EGY) and
[`countries/THA/`](../../countries/THA) packs.

### Full example — `impact_functions.json`

The file is a JSON array; each element describes one impact function.

```jsonc
// countries/EGY/impact_functions.json
[
  {
    "haz_type":      "FL",                        // CLIMADA hazard short code
    "exp_type":      "diarrhea_patients",         // exposure_type identifier
    "id":            105,                         // unique (haz_type, exp_type, id) across the merged registry
    "name":          "Diarrhoea patients",        // human-readable label (reports, tooltips)
    "intensity_unit":"m",                         // hazard intensity unit; every entry with the same haz_type must agree
    "intensity":     [0.01, 0.08, 0.44, 2.0],     // sample points, strictly non-decreasing
    "mdd":           [0.0001, 0.0002, 0.0004, 0.0009], // Mean Damage Degree — monotonic (either direction)
    "paa":           [1.0,    1.0,    1.0,    1.0]    // Percentage of Affected Assets — monotonic
  }
]
```

See
[`backend/impact/registry.py`](../../backend/impact/registry.py) for the
full list of invariants enforced at load time (intensity monotonicity,
unit consistency, ID and `(exp_type, haz_type)` uniqueness).

## Custom adaptation measures

Phase 3 ships the built-in catalogue as an in-tree XLSX that is seeded
into DuckDB on first launch by
[`backend/measures/measures_seeder.py`](../../backend/measures/measures_seeder.py).
User-supplied measure packs are not yet on a drop-in path (roadmap
issue #9). Until then, a custom measure is a row appended to the
shipped workbook with the columns listed below, re-seeded on the next
launch after a SHA-256 change.

| Column | Type | Notes |
|---|---|---|
| `name` | string | Display label shown in the Adaptation Measures panel. |
| `cost` | number | Cost factor > 0. Used by cost-benefit to scale implementation cost. |
| `MDD impact a` | number | Damage-degree multiplier applied to the impact function. `hazard_reduction_percentage = (1 - MDD impact a) * 100` and must land inside `[0, 100]`. |
| `peril_ID` | string | CLIMADA peril short code — one of `FL`, `D`, `HW` today. Map in `_PERIL_TO_HAZARD` in `measures_seeder.py`. |
| `country` | string | Country name matching a registered `country_name`. |
| `hazard_type` | string | Long-form hazard label (`flood`, `drought`, `heatwaves`). |
| `exposure_type` | string | Optional — restricts the measure to one exposure type. |

The seeder rejects duplicates keyed on
`(country, hazard_type, exposure_type, name, cost_factor)` and raises
`MeasureSeedError` on any malformed row, naming the offending line.

## Custom hazards

Hazard types shipped today — flood (`FL`), drought (`D`), heatwave
(`HW`) — are defined by CLIMADA and by the hazard-loader code in
[`backend/scenario/hazard.py`](../../backend/scenario/hazard.py). Adding a
genuinely new hazard type is not yet data-only: it requires
(a) a CLIMADA `Hazard` subclass (or a compatible HDF5 loader),
(b) a new intensity-unit entry and impact-function rows in the country
    pack (see the "Unit consistency" rule above),
(c) a new peril-to-hazard mapping in
    [`backend/measures/measures_seeder.py`](../../backend/measures/measures_seeder.py).

Until the hazard registry graduates to user-supplied drop-ins (roadmap
issue #9), treat new hazards as an in-tree change. Adding a new
return-period set for an existing hazard is fully data-driven — just
extend `return_periods` in `config.json` (see the Egypt example above).

### Scenario provenance

A run against a custom country records the custom config's
``config_version`` and ``country_config_sha256`` on the scenarios row —
the same fields the built-ins use
([``backend/provenance.py``](../../backend/provenance.py)). That ties every
saved scenario to the exact custom config bytes that were on disk when it
ran; re-running later after the analyst edited the pack will surface a
different SHA.

See
[``docs/DECISIONS.md`` § D14](../DECISIONS.md#d14--era-scientific-constants-user-adjustable-via-country-configs-and-entity-files)
and
[``docs/ARCHITECTURE.md`` § Area 22](../ARCHITECTURE.md#area-22--extensibility-custom-hazards-measures--impact-functions-medium)
for the design rationale.
