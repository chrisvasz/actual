BEGIN TRANSACTION;

-- The persisted spreadsheet cache, unused since the budget is computed in
-- memory on load.
DROP TABLE IF EXISTS kvcache;
DROP TABLE IF EXISTS kvcache_key;

COMMIT;
