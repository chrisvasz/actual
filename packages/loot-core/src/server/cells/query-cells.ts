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

import type { CellChange } from './types';

// Cells the client binds to an AQL query, like an account's balance. Each one
// keeps its last result and runs again whenever an applied change touches a
// table its query reads.
//
// Most of them are a sum or count over every transaction, which takes tens of
// milliseconds on a large budget. When a change only touched transactions,
// those are updated from the changed rows instead: the cell's query runs over
// just those rows before and after the change, and the difference is added to
// the value.

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
};

// Above this many changed transactions, running each query in full is about
// as cheap as running it twice over the changed rows.
const MAX_ROW_WISE_ROWS = 1000;

const cells = new Map<string, QueryCell>();
let listener: ((changes: CellChange[]) => void) | null = null;

export function setQueryCellListener(
  callback: ((changes: CellChange[]) => void) | null,
) {
  listener = callback;
}

export function hasQueryCell(name: string): boolean {
  return cells.has(name);
}

export function getQueryCellValue(name: string): unknown {
  return cells.get(name)?.value ?? null;
}

// A sum or count over transactions where each row's part depends only on that
// row and on other tables. A join back to `transactions` (e.g. through
// `transfer_id`) would make a row depend on another one.
function isRowWiseQuery(
  query: QueryState,
  sql: ReturnType<typeof compileQuery>,
): boolean {
  if (
    query.table !== 'transactions' ||
    !query.calculation ||
    query.groupExpressions.length > 0 ||
    query.limit != null ||
    query.offset != null ||
    query.selectExpressions.length !== 1 ||
    sql.state.namedParameters.length > 0
  ) {
    return false;
  }

  const [select] = query.selectExpressions;
  const calculation =
    typeof select === 'object' && select !== null && 'result' in select
      ? (select as { result: unknown }).result
      : null;
  if (typeof calculation !== 'object' || calculation === null) {
    return false;
  }
  const entries = Object.entries(calculation);
  if (entries.length !== 1) {
    return false;
  }
  const [fn, field] = entries[0];
  if (
    (fn !== '$sum' && fn !== '$count') ||
    typeof field !== 'string' ||
    !/^\$\w+$/.test(field)
  ) {
    return false;
  }

  return ![...sql.state.paths.values()].some(
    path => (path as { tableName: string }).tableName === 'transactions',
  );
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

function notify(changed: QueryCell[]) {
  if (listener && changed.length > 0) {
    listener(changed.map(cell => ({ name: cell.name, value: cell.value })));
  }
}

export function createQueryCell(name: string, query: QueryState) {
  // Every bind sends a fresh copy of the query, so compare it by value.
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
    isRowWise: isRowWiseQuery(query, sql),
  };
  cells.set(name, cell);
  if (run(cell)) {
    notify([cell]);
  }
}

function readsTables(cell: QueryCell, tables: Set<string>) {
  return cell.sql.state.dependencies.some(dep => tables.has(dep));
}

// Whether a change to these tables can be applied to the cell from the
// changed transactions alone.
function canUpdateByRows(cell: QueryCell, tables: Set<string>) {
  return (
    cell.isRowWise &&
    cell.isCurrent &&
    typeof cell.value === 'number' &&
    cell.sql.state.dependencies.every(
      dep => dep === 'transactions' || !tables.has(dep),
    )
  );
}

export type QueryCellUpdate = {
  tables: Set<string>;
  rowsSql: string;
  before: Map<QueryCell, number>;
};

// Called with the rows a change is about to write, before writing them.
// Records each cell's result over those rows, so `triggerQueryCells` can
// adjust the cell by the difference afterwards.
export function beginQueryCellUpdate(
  idsPerTable: Record<string, string[]>,
): QueryCellUpdate | null {
  const ids = idsPerTable.transactions;
  if (ids == null || ids.length > MAX_ROW_WISE_ROWS) {
    return null;
  }

  const tables = new Set(Object.keys(idsPerTable));
  const updatable = [...cells.values()].filter(cell =>
    canUpdateByRows(cell, tables),
  );
  if (updatable.length === 0) {
    return null;
  }

  // A split's children are only counted while their parent is alive, so a
  // change to a parent can change what its children add.
  const changed = new Set(ids);
  const idList = `(${[...changed].map(sqlString).join(',')})`;
  const children = db.runQuery<{ id: string }>(
    `SELECT id FROM transactions WHERE parent_id IN ${idList}`,
    [],
    true,
  );
  for (const { id } of children) {
    changed.add(id);
  }
  if (changed.size > MAX_ROW_WISE_ROWS) {
    return null;
  }

  const rowsSql = `(${[...changed].map(sqlString).join(',')})`;
  const before = new Map<QueryCell, number>();
  for (const cell of updatable) {
    const value = runOverRows(cell, rowsSql);
    if (value != null) {
      before.set(cell, value);
    }
  }
  return { tables, rowsSql, before };
}

export function triggerQueryCells(
  tables: Set<string>,
  update: QueryCellUpdate | null = null,
) {
  const changed: QueryCell[] = [];
  for (const cell of cells.values()) {
    if (!readsTables(cell, tables)) {
      continue;
    }

    const before = update?.before.get(cell);
    if (
      update != null &&
      before != null &&
      [...tables].every(table => update.tables.has(table)) &&
      canUpdateByRows(cell, tables)
    ) {
      const after = runOverRows(cell, update.rowsSql);
      if (after != null) {
        if (after !== before) {
          cell.value = (cell.value as number) + after - before;
          changed.push(cell);
        }
        continue;
      }
    }

    if (run(cell)) {
      changed.push(cell);
    }
  }
  notify(changed);
}

export function clearQueryCells() {
  cells.clear();
}
