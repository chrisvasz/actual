import * as db from '#server/db';

import { setByMonth } from './compute';
import type { ByMonth } from './compute';
import { monthFromDbMonth } from './inputs';

// What was spent per category per month. Only months and categories with
// transactions have an entry.
export type Spending = ByMonth<number>;

// Both queries count what the budget counts: alive, dated transactions in
// on-budget accounts, split children of alive parents but never the parents
// themselves, under the category a transaction's category was merged into.
// They read `transactions` directly instead of `v_transactions_internal_alive`
// so the `trans_budget_spending` index covers them.
const FILTERS = `
  IFNULL(t.tombstone, 0) = 0
  AND t.isParent IS NOT 1
  AND t.date IS NOT NULL
  AND (t.isChild = 0 OR (t.parent_id IS NOT NULL AND p.tombstone = 0))
`;

function dbMonthFromMonth(month: string): number {
  return parseInt(month.replace('-', ''));
}

export function loadSpending(): Spending {
  const rows = db.runQuery<{
    category: string | null;
    month: number;
    amount: number | null;
  }>(
    `SELECT cm.transferId AS category, t.date / 100 AS month,
            SUM(IFNULL(t.amount, 0)) AS amount
       FROM transactions t
       JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
       JOIN category_mapping cm ON cm.id = t.category
       LEFT JOIN transactions p ON t.isChild = 1 AND p.id = t.parent_id
      WHERE ${FILTERS}
      GROUP BY 1, 2`,
    [],
    true,
  );

  const spending: Spending = new Map();
  for (const row of rows) {
    if (row.category != null && row.amount) {
      setByMonth(
        spending,
        monthFromDbMonth(row.month),
        row.category,
        row.amount,
      );
    }
  }
  return spending;
}

export function querySpent(month: string, categoryId: string): number {
  const dbMonth = dbMonthFromMonth(month);
  const rows = db.runQuery<{ amount: number | null }>(
    db.cache(
      `SELECT SUM(IFNULL(t.amount, 0)) AS amount
         FROM category_mapping cm
         JOIN transactions t ON t.category = cm.id
         JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
         LEFT JOIN transactions p ON t.isChild = 1 AND p.id = t.parent_id
        WHERE cm.transferId = ? AND t.date >= ? AND t.date <= ?
          AND ${FILTERS}`,
    ),
    // Every date whose `date / 100` is the month, like the grouped query.
    [categoryId, dbMonth * 100, dbMonth * 100 + 99],
    true,
  );
  return rows[0]?.amount || 0;
}

// Re-reads the spending of the given months and categories.
export function refreshSpending(
  spending: Spending,
  pairs: Iterable<[month: string, categoryId: string]>,
) {
  for (const [month, categoryId] of pairs) {
    const amount = querySpent(month, categoryId);
    if (amount) {
      setByMonth(spending, month, categoryId, amount);
    } else {
      spending.get(month)?.delete(categoryId);
    }
  }
}

type Row = Record<string, unknown>;
// Applied sync changes: table name to row id to row.
type DataMap = Map<string, unknown>;

function rowsOf(data: DataMap, table: string): Map<string, Row> | undefined {
  const rows = data.get(table);
  return rows instanceof Map ? rows : undefined;
}

// Changing any of these can move a transaction in or out of a month's total.
const SPENDING_FIELDS = [
  'date',
  'acct',
  'amount',
  'category',
  'tombstone',
  'isParent',
  'isChild',
  'parent_id',
];

export type SpendingChanges = {
  // Everything has to be read again.
  reloadAll: boolean;
  pairs: Array<[month: string, categoryId: string]>;
};

// Which spending totals an applied sync batch can have changed.
export function getSpendingChanges(
  oldData: DataMap,
  newData: DataMap,
): SpendingChanges {
  const accounts = rowsOf(newData, 'accounts');
  if (accounts) {
    for (const [id, account] of accounts) {
      const old = rowsOf(oldData, 'accounts')?.get(id);
      // An account that shows up late can be one that transactions already
      // reference.
      if (!old || old.offbudget !== account.offbudget) {
        return { reloadAll: true, pairs: [] };
      }
    }
  }
  // A merged category's transactions now count under another category.
  if (rowsOf(newData, 'category_mapping')?.size) {
    return { reloadAll: true, pairs: [] };
  }

  const transactions = rowsOf(newData, 'transactions');
  if (!transactions) {
    return { reloadAll: false, pairs: [] };
  }

  // Rows from sync come with `category` already mapped through
  // `category_mapping` (see `fetchData` in sync), as does the query for split
  // children below.
  const keys = new Map<string, [string, string]>();
  function add(row: Row) {
    if (typeof row.date !== 'number' || typeof row.category !== 'string') {
      return;
    }
    const month = monthFromDbMonth(Math.floor(row.date / 100));
    keys.set(month + '|' + row.category, [month, row.category]);
  }

  const oldTransactions = rowsOf(oldData, 'transactions');
  for (const [id, row] of transactions) {
    const old = oldTransactions?.get(id);
    if (old && !SPENDING_FIELDS.some(field => old[field] !== row[field])) {
      continue;
    }
    if (old) {
      add(old);
    }
    add(row);

    // Children only count while their parent row exists and is alive,
    // whether or not it is marked as a parent (children can also arrive
    // before their parent).
    if (
      !old ||
      row.isParent === 1 ||
      old.isParent === 1 ||
      old.tombstone !== row.tombstone
    ) {
      const children = db.runQuery<Row>(
        `SELECT t.date, cm.transferId AS category FROM transactions t
           LEFT JOIN category_mapping cm ON cm.id = t.category
          WHERE t.parent_id = ?`,
        [id],
        true,
      );
      children.forEach(add);
    }
  }

  return { reloadAll: false, pairs: [...keys.values()] };
}
