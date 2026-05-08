-- 0010_exposure_unify: collapse the exposure economic/non-economic split.
-- The legacy schema carried both exposure_economic and exposure_non_economic
-- on every scenario row even though only one was ever populated. The new
-- shape stores a single exposure_type (asset name) plus an asset_type tag
-- ("economic" or "non_economic") chosen by the user.
--
-- Pre-production: existing rows are intentionally wiped rather than
-- migrated. The cache key derivation also changed (no longer includes
-- the asset-type split), so the computation cache is cleared too.

DELETE FROM snapshots;
DELETE FROM scenario_results;
DELETE FROM scenarios;
DELETE FROM computation_cache;

ALTER TABLE scenarios DROP COLUMN exposure_economic;
ALTER TABLE scenarios DROP COLUMN exposure_non_economic;
ALTER TABLE scenarios ADD COLUMN exposure_type VARCHAR;
ALTER TABLE scenarios ADD COLUMN asset_type VARCHAR;
