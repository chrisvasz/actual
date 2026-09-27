BEGIN TRANSACTION;

-- Matches the account register's filter and default sort, so its first page
-- reads rows already in order and stops at the page size instead of joining
-- and sorting every transaction in the account.
CREATE INDEX IF NOT EXISTS idx_transactions_acct_order ON transactions(acct, tombstone, date DESC, starting_balance_flag, sort_order DESC, id);

COMMIT;
