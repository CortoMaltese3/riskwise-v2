-- 0003_cred_data: CRED macroeconomic data tables (Area 23).
-- Adds sha256 to cred_datasets and creates cred_data for timeseries rows.
-- The seeder (backend/macroeconomic/cred_seeder.py) populates the built-in
-- dataset on first launch; subsequent startups skip the insert by checking
-- (is_builtin, sha256).

ALTER TABLE cred_datasets ADD COLUMN sha256 VARCHAR;

CREATE TABLE cred_data (
    id            VARCHAR  PRIMARY KEY,
    dataset_id    VARCHAR  NOT NULL,
    country       VARCHAR  NOT NULL,
    scenario      VARCHAR  NOT NULL,
    adpatation    DOUBLE,
    variable      VARCHAR  NOT NULL,
    sector        VARCHAR  NOT NULL,
    year          INTEGER  NOT NULL,
    value         DOUBLE
);

CREATE INDEX cred_data_dataset_idx ON cred_data (dataset_id);
CREATE INDEX cred_data_filter_idx  ON cred_data (dataset_id, country, scenario, variable, sector);
