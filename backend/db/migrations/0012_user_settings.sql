-- 0012_user_settings: persisted per-install report-formatting preferences (#351).
-- Singleton row keyed by id = 1: the GET handler inserts the defaults on first
-- read so the application can boot without a migration-time seed step, and a
-- PATCH never has to invent the row it is meant to update.
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY,
    report_locale VARCHAR NOT NULL DEFAULT 'en-US',
    report_currency VARCHAR NOT NULL DEFAULT 'EUR'
);
