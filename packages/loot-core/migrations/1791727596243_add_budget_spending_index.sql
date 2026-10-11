BEGIN TRANSACTION;

-- Covers the queries that total what was spent per category per month for
-- the budget (`server/budget/spending.ts`).
CREATE INDEX IF NOT EXISTS trans_budget_spending ON transactions(category, date, acct, amount, tombstone, isParent, isChild, parent_id);

COMMIT;
