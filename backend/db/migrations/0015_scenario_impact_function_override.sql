-- 0015_scenario_impact_function_override: add the per-scenario IF override (#453).
-- Custom-mode users can edit the active impact function in the UI before a
-- run. The edited curve is stored on the scenario row (not as a rewrite of
-- the uploaded XLSX, see DECISIONS D28) so the file on disk stays byte-
-- identical and the override travels with the scenario for exact replay.
-- NULL means "no override — run the entity workbook unchanged". DuckDB
-- has no JSONB type; the JSON type is the closest analogue and is what
-- the rest of the codebase uses for ad-hoc structured columns.

ALTER TABLE scenarios ADD COLUMN impact_function_override JSON;
