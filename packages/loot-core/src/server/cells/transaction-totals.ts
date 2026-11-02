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

export type TotalsRow = {
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

function addRow(
  byKey: Map<string, TotalsGroup>,
  row: TotalsRow,
  sign: number,
): boolean {
  const key = groupKey(row.account, row.cleared);
  let group = byKey.get(key);
  const isNew = group == null;
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
  return isNew;
}

function load(): Map<string, TotalsGroup> {
  const loaded = new Map<string, TotalsGroup>();
  for (const row of readTotals('')) {
    addRow(loaded, row, 1);
  }
  groups = loaded;
  return loaded;
}

export function isTotalsLoaded(): boolean {
  return groups != null;
}

export function getTotalsGroups(): TotalsGroup[] {
  return [...(groups ?? load()).values()];
}

// The totals of the given transactions only, to be subtracted before a change
// writes them and added back after.
export function readTotalsOverRows(rowsSql: string): TotalsRow[] {
  return readTotals(`WHERE id IN ${rowsSql}`);
}

// Moves the totals from the changed rows as they were to as they are. Returns
// whether a group was added. Totals not read yet will be read as they are.
export function adjustTotals(before: TotalsRow[], after: TotalsRow[]): boolean {
  const byKey = groups;
  if (!byKey) {
    return false;
  }
  let isAdded = false;
  for (const row of before) {
    isAdded = addRow(byKey, row, -1) || isAdded;
  }
  for (const row of after) {
    isAdded = addRow(byKey, row, 1) || isAdded;
  }
  return isAdded;
}

export function reloadTotals() {
  load();
}

export function clearTotals() {
  groups = null;
}
