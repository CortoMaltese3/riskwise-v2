-- 0006_imported_flag: mark scenarios that came in via .riskwise-scenario import (#122).
-- Imported scenarios are read-only — the original input data is not bundled
-- in the ZIP, so they cannot be re-run. The workspace UI uses this flag to
-- disable the "Re-run" affordance and surface an "Imported" badge.
ALTER TABLE scenarios ADD COLUMN is_imported BOOLEAN DEFAULT FALSE;
