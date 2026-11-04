import { logger } from '#platform/server/log';
import {
  aqlCompiledQuery,
  compileQuery,
  schema,
  schemaConfig,
} from '#server/aql';
import { appendWhere } from '#server/aql/compiler';
import * as db from '#server/db';
import type { QueryState } from '#shared/query';

import {
  adjustTotals,
  clearTotals,
  getTotalsGroups,
  isTotalsLoaded,
  readTotalsOverRows,
  reloadTotals,
} from './transaction-totals';
import type { TotalsGroup, TotalsRow } from './transaction-totals';

// Cells the client binds to an AQL query, like an account's balance. Each one
// keeps its last result and runs again whenever an applied change touches a
// table its query reads. The client reads a cell (`liveReads.cell`), which
// binds it, and is told the names of the cells a change changed; it releases
// a cell once nothing shows it, which drops it.
//
// Most of them are a sum or count over every transaction, which takes tens of
// milliseconds on a large budget. The balances only pick transactions by
// their account and cleared state, so they add up the matching groups of the
// transaction totals instead (see `transaction-totals`), and binding one
// again, like reopening a register, costs about as little as the first time.
// The other sums and counts are updated from the changed rows when a change
// only touched transactions: the cell's query runs over just those rows
// before and after the change, and the difference is added to the value.

type QueryCell = {
  name: string;
  query: QueryState;
  // Re-binding the same query is a no-op.
  queryKey: string;
  sql: ReturnType<typeof compileQuery>;
  value: unknown;
  // Whether `value` is the query's current result, so it can be adjusted by
  // the changed rows. It isn't when the last run failed.
  isCurrent: boolean;
  isRowWise: boolean;
  // Set for a balance made of transaction totals
  totals: CellTotals | null;
};

type CellTotals = {
  mode: 'none' | 'inline';
  field: 'sum' | 'count';
  // The groups the query's filter picks
  groups: TotalsGroup[];
};

// Above this many changed transactions, running each query in full is about
// as cheap as running it twice over the changed rows.
const MAX_ROW_WISE_ROWS = 1000;

const cells = new Map<string, QueryCell>();

export function hasQueryCell(name: string): boolean {
  return cells.has(name);
}

// A run replaces the value rather than changing it, so the client can keep
// and share it.
export function getQueryCellValue(name: string): unknown {
  return cells.get(name)?.value ?? null;
}

// The sums and counts the app binds, the only results that can be adjusted by
// the changed rows.
const ROW_WISE_SELECTS = [
  JSON.stringify([{ result: { $sum: '$amount' } }]),
  JSON.stringify([{ result: { $count: '$id' } }]),
];

// A sum or count over transactions where each row's part depends only on that
// row and on other tables. A join back to `transactions` (e.g. through
// `transfer_id`) would make a row depend on another one.
function isRowWiseQuery(
  query: QueryState,
  sql: ReturnType<typeof compileQuery>,
): boolean {
  return (
    query.table === 'transactions' &&
    query.calculation &&
    query.groupExpressions.length === 0 &&
    query.limit == null &&
    query.offset == null &&
    ROW_WISE_SELECTS.includes(JSON.stringify(query.selectExpressions)) &&
    sql.state.namedParameters.length === 0 &&
    ![...sql.state.paths.values()].some(
      path => (path as { tableName: string }).tableName === 'transactions',
    )
  );
}

// Fields a balance can filter on: the same for every transaction in a group
// of the totals.
function isTotalsFilter(filter: unknown): boolean {
  if (Array.isArray(filter)) {
    return filter.every(isTotalsFilter);
  }
  if (filter == null) {
    return true;
  }
  if (typeof filter !== 'object') {
    return false;
  }
  return Object.entries(filter).every(([key, value]) =>
    key === '$and' || key === '$or'
      ? isTotalsFilter(value)
      : key === 'account' || key.startsWith('account.') || key === 'cleared',
  );
}

// How the cell's query adds up transaction totals, if it can: a sum or count
// over the transactions picked by their account and cleared state.
function totalsShape(
  query: QueryState,
  sql: ReturnType<typeof compileQuery>,
): Omit<CellTotals, 'groups'> | null {
  const splits = query.tableOptions?.splits ?? 'inline';
  if (
    !isRowWiseQuery(query, sql) ||
    query.withDead ||
    query.rawMode ||
    !['none', 'inline', 'grouped'].includes(splits as string) ||
    !isTotalsFilter(query.filterExpressions)
  ) {
    return null;
  }
  return {
    mode: splits === 'none' ? 'none' : 'inline',
    field:
      JSON.stringify(query.selectExpressions) === ROW_WISE_SELECTS[0]
        ? 'sum'
        : 'count',
  };
}

// The groups the cell's filter picks, found by running its filter over one
// row per group, or null if that failed. A filter reading anything but the
// account and cleared state fails here, as the rows have no other columns.
function matchGroups(cell: QueryCell): TotalsGroup[] | null {
  const groups = getTotalsGroups();
  if (groups.length === 0) {
    return [];
  }
  const { from, joins, where } = cell.sql.sqlPieces;
  try {
    const rows = db.runQuery<{ _index: number }>(
      `WITH _groups(_index, account, cleared) AS (
         VALUES ${groups.map(() => '(?, ?, ?)').join(', ')}
       )
       SELECT DISTINCT ${from}._index FROM _groups AS ${from} ${joins} ${where}`,
      groups.flatMap((group, i) => [i, group.account, group.cleared]),
      true,
    );
    return rows.map(row => groups[row._index]);
  } catch (e) {
    logger.warn(`Failed matching ${cell.name} to transaction totals!`, e);
    return null;
  }
}

function totalsValue({ mode, field, groups }: CellTotals): number {
  let value = 0;
  for (const group of groups) {
    value += group[mode][field];
  }
  return value;
}

// What the cell adds up from the transaction totals, if its query is a
// balance and its groups could be found.
function findTotals(cell: QueryCell): CellTotals | null {
  const shape = totalsShape(cell.query, cell.sql);
  const groups = shape && matchGroups(cell);
  return shape && groups ? { ...shape, groups } : null;
}

// Runs the cell's query and returns whether it succeeded. A failing query
// keeps its last value.
function run(cell: QueryCell): boolean {
  try {
    cell.value = aqlCompiledQuery(
      cell.query,
      cell.sql.sqlPieces,
      cell.sql.state,
    );
    cell.isCurrent = true;
    return true;
  } catch (e) {
    logger.warn(`Failed running ${cell.name}!`, e);
    cell.isCurrent = false;
    return false;
  }
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

// The cell's query over the given transactions only, or null if it failed.
function runOverRows(cell: QueryCell, rowsSql: string): number | null {
  const { sqlPieces, state } = cell.sql;
  try {
    const value = aqlCompiledQuery(
      cell.query,
      {
        ...sqlPieces,
        where: appendWhere(
          sqlPieces.where,
          `${sqlPieces.from}.id IN ${rowsSql}`,
        ),
      },
      state,
    );
    return typeof value === 'number' ? value : null;
  } catch (e) {
    logger.warn(`Failed running ${cell.name} over changed rows!`, e);
    return null;
  }
}

// Binds the cell `name` to `query` and runs it, unless it's already bound to
// an equal query. Whoever binds it reads the new value, so it isn't reported
// as a change. A name is only ever bound to one query at a time: a reader of
// the same name with another query wouldn't be told it was replaced.
export function createQueryCell(name: string, query: QueryState) {
  const queryKey = JSON.stringify(query);
  const existing = cells.get(name);
  if (existing?.queryKey === queryKey) {
    return;
  }

  const sql = compileQuery(query, schema, schemaConfig);
  const cell: QueryCell = {
    name,
    query,
    queryKey,
    sql,
    value: existing?.value ?? null,
    isCurrent: false,
    isRowWise: false,
    totals: null,
  };
  cells.set(name, cell);
  cell.totals = findTotals(cell);
  if (cell.totals) {
    cell.value = totalsValue(cell.totals);
    cell.isCurrent = true;
  } else {
    cell.isRowWise = isRowWiseQuery(query, sql);
    run(cell);
  }
}

// Drops the cell `name` as no longer shown, unless it has since been bound to
// another query.
export function releaseQueryCell(name: string, query: QueryState) {
  if (cells.get(name)?.queryKey === JSON.stringify(query)) {
    cells.delete(name);
  }
}

function readsTables(cell: QueryCell, tables: Set<string>) {
  return cell.sql.state.dependencies.some(dep => tables.has(dep));
}

export type QueryCellUpdate = {
  rowsSql: string;
  before: Map<QueryCell, number>;
  // The transaction totals over the rows, if they're loaded
  totalsBefore: TotalsRow[] | null;
};

function readTotalsOrNull(rowsSql: string): TotalsRow[] | null {
  try {
    return readTotalsOverRows(rowsSql);
  } catch (e) {
    logger.warn('Failed reading the transaction totals of changed rows!', e);
    return null;
  }
}

// Called with the rows a change is about to write, before writing them.
// Records the transaction totals and each cell's result over those rows, so
// `triggerQueryCells` can adjust them by the difference afterwards. Only for
// cells that read no other table the change touches.
export function beginQueryCellUpdate(
  idsPerTable: Record<string, string[]>,
): QueryCellUpdate | null {
  // One entry per message, so a row can be listed many times
  const ids = new Set(idsPerTable.transactions);
  if (ids.size === 0 || ids.size > MAX_ROW_WISE_ROWS) {
    return null;
  }

  // A split's children are only counted while their parent is alive, so a
  // change to a parent can change what its children add. A child can only
  // join or leave a parent by changing itself, so these are the same children
  // before and after the write. The ids are listed rather than looked up in a
  // subquery, which SQLite can plan as a walk over every transaction.
  const changed = new Set(ids);
  try {
    const children = db.runQuery<{ id: string }>(
      `SELECT id FROM transactions WHERE parent_id IN (${[...changed].map(sqlString).join(',')})`,
      [],
      true,
    );
    for (const { id } of children) {
      changed.add(id);
    }
  } catch (e) {
    // This runs inside the change's transaction, so failing here would fail
    // the change. Run the cells in full instead.
    logger.warn("Failed finding the changed transactions' children!", e);
    return null;
  }
  const rowsSql = `(${[...changed].map(sqlString).join(',')})`;

  const tables = new Set(Object.keys(idsPerTable));
  const before = new Map<QueryCell, number>();
  for (const cell of cells.values()) {
    if (
      cell.isRowWise &&
      cell.isCurrent &&
      cell.sql.state.dependencies.every(
        dep => dep === 'transactions' || !tables.has(dep),
      )
    ) {
      const value = runOverRows(cell, rowsSql);
      if (value != null) {
        before.set(cell, value);
      }
    }
  }
  const totalsBefore = isTotalsLoaded() ? readTotalsOrNull(rowsSql) : null;
  return { rowsSql, before, totalsBefore };
}

// Brings the transaction totals up to date with a change to transactions;
// returns whether the groups changed, rather than only their totals.
function updateTotals(update: QueryCellUpdate | null): boolean {
  const after = update?.totalsBefore ? readTotalsOrNull(update.rowsSql) : null;
  if (update?.totalsBefore && after) {
    return adjustTotals(update.totalsBefore, after);
  }
  reloadTotals();
  return true;
}

// Brings the cells reading `tables` up to date with a change; returns the
// names of the cells it changed.
export function triggerQueryCells(
  tables: Set<string>,
  update: QueryCellUpdate | null = null,
): string[] {
  const areGroupsChanged =
    isTotalsLoaded() && tables.has('transactions') && updateTotals(update);

  const changed: string[] = [];
  for (const cell of cells.values()) {
    if (!readsTables(cell, tables)) {
      continue;
    }

    if (cell.totals) {
      // A change to accounts can change which groups the filter picks
      const isMatchChanged =
        areGroupsChanged ||
        cell.sql.state.dependencies.some(
          dep => dep !== 'transactions' && tables.has(dep),
        );
      if (isMatchChanged) {
        cell.totals = findTotals(cell);
        if (!cell.totals) {
          cell.isRowWise = isRowWiseQuery(cell.query, cell.sql);
          run(cell);
          changed.push(cell.name);
          continue;
        }
      }
      const value = totalsValue(cell.totals);
      if (value !== cell.value) {
        cell.value = value;
        changed.push(cell.name);
      }
      continue;
    }

    const before = update?.before.get(cell);
    const after =
      update && before != null ? runOverRows(cell, update.rowsSql) : null;
    if (before != null && after != null) {
      if (after !== before) {
        cell.value = (cell.value as number) + after - before;
        changed.push(cell.name);
      }
    } else if (run(cell)) {
      changed.push(cell.name);
    }
  }
  return changed;
}

export function clearQueryCells() {
  cells.clear();
  clearTotals();
}
