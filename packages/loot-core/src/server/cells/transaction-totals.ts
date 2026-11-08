import { logger } from '#platform/server/log';
import * as db from '#server/db';

// The sum and count of the transactions in each account and cleared state,
// which every balance the app shows is made of. They're read once, the first
// time a balance needs them, and then adjusted by the rows each change writes,
// so binding a balance adds up a few groups instead of every transaction.
//
// Each group keeps both of the ways a balance can count splits: `none` counts
// a split's parent, `inline` its children (as `grouped` does for sums and
// counts). They only differ when a split's children don't add up to it.

export type Totals = { sum: number; count: number };

export type TotalsGroup = {
  account: string;
  cleared: number | null;
  none: Totals;
  inline: Totals;
};

type TotalsRow = {
  account: string;
  cleared: number | null;
  noneSum: number;
  noneCount: number;
  inlineSum: number;
  inlineCount: number;
};

// Groups by `groupKey`. A group is kept once its transactions are gone, so the
// set of groups only changes when one is added or everything is read again.
let groups: Map<string, TotalsGroup> | null = null;

function groupKey(account: string, cleared: number | null) {
  return JSON.stringify([account, cleared]);
}

// Reads the view the balances read, so every row counts as it does for them:
// alive, dated, in an account, and a child only while its parent is alive.
// `none` counts the rows without a parent, `inline` the ones that aren't one,
// as the `splits` options do.
function readTotals(where: string): TotalsRow[] {
  return db.runQuery<TotalsRow>(
    `SELECT account, cleared,
            SUM(CASE WHEN parent_id IS NULL THEN amount ELSE 0 END) AS noneSum,
            SUM(parent_id IS NULL) AS noneCount,
            SUM(CASE WHEN is_parent = 0 THEN amount ELSE 0 END) AS inlineSum,
            SUM(is_parent = 0) AS inlineCount
       FROM v_transactions_internal_alive
       ${where}
      GROUP BY account, cleared`,
    [],
    true,
  );
}

function addRow(byKey: Map<string, TotalsGroup>, row: TotalsRow, sign: number) {
  const key = groupKey(row.account, row.cleared);
  let group = byKey.get(key);
  if (!group) {
    group = {
      account: row.account,
      cleared: row.cleared,
      none: { sum: 0, count: 0 },
      inline: { sum: 0, count: 0 },
    };
    byKey.set(key, group);
  }
  group.none.sum += sign * (row.noneSum ?? 0);
  group.none.count += sign * (row.noneCount ?? 0);
  group.inline.sum += sign * (row.inlineSum ?? 0);
  group.inline.count += sign * (row.inlineCount ?? 0);
}

function load(): Map<string, TotalsGroup> {
  const loaded = new Map<string, TotalsGroup>();
  for (const row of readTotals('')) {
    addRow(loaded, row, 1);
  }
  groups = loaded;
  return loaded;
}

export function getTotalsGroups(): TotalsGroup[] {
  return [...(groups ?? load()).values()];
}

// The totals of the rows a change is about to write, read before writing
// them, or null if the totals aren't loaded or the rows couldn't be read.
export function beginTotalsUpdate(rowsSql: string | null): TotalsRow[] | null {
  if (!groups || rowsSql == null) {
    return null;
  }
  try {
    return readTotals(`WHERE id IN ${rowsSql}`);
  } catch (e) {
    logger.warn('Failed reading the transaction totals of changed rows!', e);
    return null;
  }
}

// Moves the totals from the changed rows as they were to as they are, or
// reads them all again if the rows couldn't be read. Returns whether the
// groups changed, rather than only their totals.
export function finishTotalsUpdate(
  before: TotalsRow[] | null,
  rowsSql: string | null,
): boolean {
  if (!groups) {
    return false;
  }
  const after = before && beginTotalsUpdate(rowsSql);
  if (!before || !after) {
    load();
    return true;
  }
  const size = groups.size;
  for (const row of before) {
    addRow(groups, row, -1);
  }
  for (const row of after) {
    addRow(groups, row, 1);
  }
  return groups.size !== size;
}

export function clearTotals() {
  groups = null;
}
