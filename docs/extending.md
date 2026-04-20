# Extending RISK WISE

This file documents the project's extension surfaces. It is a stub today;
the full extensibility model (auto-scan, namespace isolation, loader
contracts) lands with [issue #9](https://github.com/CortoMaltese3/riskwise-v2/issues/9).

## Country configs (`countries/<ISO3>/config.json`)

Per-country scientific constants live in versioned JSON files and are read by
[`backend/countries/loader.py`](../backend/countries/loader.py). To add a new
country, drop in `countries/<ISO3>/config.json` matching the schema below;
nothing else needs to change in `run_scenario.py`.

### Schema

| Field | Type | Notes |
|---|---|---|
| `config_version` | integer | Bump on breaking changes; loader reads version 1. |
| `country_code` | string | ISO3 (must match the directory name). |
| `country_name` | string | Display name. |
| `discount_rate` | number | Annual discount rate, expressed as a fraction (e.g. `0.0689` for 6.89%). |
| `annual_growth_rate` | object | `{exposure_type: rate}` — one entry per sector ERA recognises for the country. Negative rates allowed. |
| `return_periods` | object | `{hazard_code: [years, ...]}` — hazard codes are CLIMADA short codes (`FL`, `D`, `HW`, …); each value is a non-empty list of positive integers. |
| `source_references` | array of strings | Citations for each value. Use one entry per field with the form `"<field> <value> — <source>"`. |

A missing or malformed file raises
[`CountryConfigError`](../backend/countries/loader.py) with a message that
names the offending field — never a bare `KeyError`.

### Example: `countries/EGY/config.json`

```json
{
  "config_version": 1,
  "country_code": "EGY",
  "country_name": "Egypt",
  "discount_rate": 0.0689,
  "annual_growth_rate": {
    "crops": 0.04,
    "roads": 0.0129
  },
  "return_periods": {
    "FL": [2, 5, 10, 25],
    "D": [10, 25, 50, 75, 100]
  },
  "source_references": [
    "discount_rate 6.89% — World Bank average lending rate, Egypt, 2023"
  ]
}
```

See [`docs/DECISIONS.md` § D14](DECISIONS.md#d14--era-scientific-constants-user-adjustable-via-country-configs-and-entity-files)
and [`docs/ARCHITECTURE.md` § Area 7](ARCHITECTURE.md#area-7--backend-refactor-high)
for the design rationale.
