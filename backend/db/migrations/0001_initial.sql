-- 0001_initial: v2 scenario-store skeleton.
-- Adds the scenario metadata, results, cache, snapshot, CRED, and
-- adaptation-measure tables described in docs/ARCHITECTURE.md Area 3. The
-- runner manages schema_version bookkeeping; this file is pure DDL.

CREATE TABLE scenarios (
    id VARCHAR PRIMARY KEY,
    name VARCHAR,
    tags VARCHAR,
    notes VARCHAR,
    country VARCHAR,
    hazard_type VARCHAR,
    scenario VARCHAR,
    exposure_economic VARCHAR,
    exposure_non_economic VARCHAR,
    ref_year INTEGER,
    future_year INTEGER,
    annual_growth DOUBLE,
    is_era BOOLEAN,
    app_option VARCHAR,
    status VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scenario_results (
    id VARCHAR PRIMARY KEY,
    scenario_id VARCHAR NOT NULL,
    result_type VARCHAR NOT NULL,
    data BLOB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX scenario_results_scenario_id_idx ON scenario_results (scenario_id);

CREATE TABLE computation_cache (
    cache_key VARCHAR PRIMARY KEY,
    result_type VARCHAR NOT NULL,
    data BLOB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE snapshots (
    id VARCHAR PRIMARY KEY,
    scenario_id VARCHAR NOT NULL,
    snapshot_type VARCHAR NOT NULL,
    image BLOB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX snapshots_scenario_id_idx ON snapshots (scenario_id);

CREATE TABLE cred_datasets (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    source VARCHAR,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE measure_sets (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    sha256 VARCHAR
);

CREATE TABLE adaptation_measures (
    id VARCHAR PRIMARY KEY,
    measure_set_id VARCHAR NOT NULL,
    country VARCHAR,
    hazard_type VARCHAR,
    exposure_type VARCHAR,
    name VARCHAR,
    description VARCHAR,
    source_reference VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX adaptation_measures_set_idx ON adaptation_measures (measure_set_id);
