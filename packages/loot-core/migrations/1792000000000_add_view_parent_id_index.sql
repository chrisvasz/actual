BEGIN TRANSACTION;

-- The transaction views expose `parent_id` as this expression (it's NULL
-- unless the row is a child), so a lookup of children by `parent_id`, like
-- the register's query for the splits it shows, can't use `trans_parent_id`
-- and scans every transaction.
CREATE INDEX IF NOT EXISTS trans_view_parent_id ON transactions(CASE WHEN isChild = 0 THEN NULL ELSE parent_id END);

COMMIT;
