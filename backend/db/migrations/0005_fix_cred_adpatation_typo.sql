-- 0005_fix_cred_adpatation_typo: rename the misspelled column adpatation → adaptation.
-- DuckDB requires dependent indexes to be dropped before renaming a column.
DROP INDEX cred_data_dataset_idx;
DROP INDEX cred_data_filter_idx;
ALTER TABLE cred_data RENAME COLUMN adpatation TO adaptation;
CREATE INDEX cred_data_dataset_idx ON cred_data (dataset_id);
CREATE INDEX cred_data_filter_idx  ON cred_data (dataset_id, country, scenario, variable, sector);
