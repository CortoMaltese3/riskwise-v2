-- 0004_measures_data: Adaptation measures column additions for DuckDB-backed store (Area 24).
-- Adds cost_factor, hazard_reduction_percentage, and is_builtin to adaptation_measures.
-- The seeder (backend/measures/measures_seeder.py) populates the built-in
-- dataset on first launch; subsequent startups skip the insert by checking
-- (is_builtin, sha256 in measure_sets).
--
-- DuckDB 1.x does not support ADD COLUMN ... NOT NULL in a single ALTER.
-- NOT NULL is enforced at the seeder layer; DEFAULT FALSE backfills pre-existing rows.

ALTER TABLE adaptation_measures ADD COLUMN cost_factor DOUBLE DEFAULT 0;
ALTER TABLE adaptation_measures ADD COLUMN hazard_reduction_percentage DOUBLE DEFAULT 0;
ALTER TABLE adaptation_measures ADD COLUMN is_builtin BOOLEAN DEFAULT FALSE;
