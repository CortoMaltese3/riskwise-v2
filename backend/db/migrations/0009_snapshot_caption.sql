-- 0009_snapshot_caption: optional user-supplied label on captured snapshots (#303).
-- Captions are entered post-capture from the snapshot drawer. NULL means
-- the user has not labelled the snapshot yet; the UI shows the snapshot
-- type and timestamp as a fallback.
ALTER TABLE snapshots ADD COLUMN caption VARCHAR;
