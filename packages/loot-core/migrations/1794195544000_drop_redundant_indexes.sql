BEGIN TRANSACTION;

-- `trans_category` and `trans_category_date` are prefixes of
-- `trans_budget_spending`, which serves the same lookups.
DROP INDEX IF EXISTS trans_category;
DROP INDEX IF EXISTS trans_category_date;

-- Date-range lookups use `trans_sorted` (which leads with `date`) instead.
DROP INDEX IF EXISTS trans_date;

-- Nothing reads `payee_locations` since the feature was removed; sync writes
-- to it by primary key only.
DROP INDEX IF EXISTS idx_payee_locations_payee_id;
DROP INDEX IF EXISTS idx_payee_locations_tombstone_payee_created;
DROP INDEX IF EXISTS idx_payee_locations_geo_tombstone;

COMMIT;
