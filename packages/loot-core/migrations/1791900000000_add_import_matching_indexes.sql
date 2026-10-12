BEGIN TRANSACTION;

-- Cover the per-row lookups when matching imported transactions
-- (`matchTransactions` in `server/accounts/sync.ts`): by imported id, and by
-- amount and date. `IFNULL(amount, 0)` is how the transaction views expose
-- `amount`. `tombstone` keeps rows sharing an imported id in the same order as
-- the `idx_transactions_acct_tombstone` scan the lookup replaces.
CREATE INDEX IF NOT EXISTS trans_acct_imported_id ON transactions(acct, financial_id, tombstone);
CREATE INDEX IF NOT EXISTS trans_acct_amount_date ON transactions(acct, IFNULL(amount, 0), date);

COMMIT;
