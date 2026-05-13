-- 0014_measure_code: add the engine-side short code to the catalog (#429).
-- The engine echoes ``measure_name`` verbatim from the entity xlsx, which
-- ships opaque codes ("GR", "TP", "GBC"). The catalog rows carry an i18n
-- key ("adaptation_measures_green_roofs"). Storing the code on the
-- catalog row lets ``compute_cost_benefit_data`` join the engine output
-- back to the catalog i18n key so the chart can render translated names.
-- Nullable: catalog rows whose code mapping needs data-owner clarification
-- ship blank and the chart falls back to the raw engine name.

ALTER TABLE adaptation_measures ADD COLUMN code VARCHAR;
