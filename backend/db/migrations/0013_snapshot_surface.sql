-- 0013_snapshot_surface: domain tag for snapshots (#362).
-- The existing ``snapshot_type`` is "map" / "waterfall" / "cost_benefit", but
-- "map" alone is ambiguous — it can be a hazard, exposure, or impact map.
-- The PDF report restructure needs to route each captured snapshot into the
-- correct per-domain section (Hazard / Exposure / Impact / Cost-Benefit),
-- so we record the surface that produced the snapshot at capture time.
-- NULL means "uncategorized" (pre-#362 rows) so the consuming UI keeps
-- working without a backfill.
ALTER TABLE snapshots ADD COLUMN surface VARCHAR;
