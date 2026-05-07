-- 0008_saved_flag: hide unsaved runs from the workspace list (#302).
-- Every completed run is inserted into ``scenarios`` so the active
-- analysis tab, restore, and PDF export have somewhere to read result
-- blobs from. The workspace list now filters on ``saved = TRUE`` so
-- only runs the user explicitly named via the save dialog appear.
ALTER TABLE scenarios ADD COLUMN saved BOOLEAN DEFAULT FALSE;

-- Backfill: every existing row predates this column and was visible
-- in the workspace before the migration ran. Mark them all saved so
-- existing users do not lose their workspace on upgrade.
UPDATE scenarios SET saved = TRUE;
