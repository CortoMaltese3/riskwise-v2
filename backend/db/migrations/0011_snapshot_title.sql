-- 0011_snapshot_title: optional short heading shown above the caption in PDF reports (#350).
-- Captions remain the descriptive line beneath the figure; the new ``title``
-- column carries the short heading rendered above it. NULL means the user has
-- not set a title yet; the UI keeps falling back to the snapshot type label.
ALTER TABLE snapshots ADD COLUMN title VARCHAR;
