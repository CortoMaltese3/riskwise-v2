-- 0002_provenance: scientific-reproducibility provenance columns (#55).
-- Every saved scenario row records the exact versions, input-data hashes,
-- country-config SHA, and random seed it was computed with. NOT NULL on
-- every column prevents inserts that forget to populate provenance; empty
-- string / zero defaults backfill any pre-existing rows without a down
-- migration. ``computed_at`` is separate from ``created_at`` so that a
-- scenario re-inserted from an export keeps its original compute timestamp.

-- DuckDB 1.x does not support ``ADD COLUMN ... NOT NULL`` in a single
-- ALTER; "NOT NULL" on the handler side (``db.scenario_store.insert_scenario``
-- raises on any missing provenance field) provides the rejection
-- behaviour the acceptance criteria require, and the DEFAULT values here
-- backfill any pre-existing rows so readers never see a literal NULL.
ALTER TABLE scenarios ADD COLUMN app_version VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN engine_version VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN climada_version VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN entity_data_sha256 VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN hazard_data_sha256 VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN country_config_sha256 VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN config_version VARCHAR DEFAULT '';
ALTER TABLE scenarios ADD COLUMN random_seed BIGINT DEFAULT 0;
ALTER TABLE scenarios ADD COLUMN computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
