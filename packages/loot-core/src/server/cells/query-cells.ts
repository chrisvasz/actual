import { logger } from '#platform/server/log';
import {
  aqlCompiledQuery,
  compileQuery,
  schema,
  schemaConfig,
} from '#server/aql';
import type { QueryState } from '#shared/query';

import type { CellChange } from './types';

// Cells the client binds to an AQL query, like an account's balance. Each one
// keeps its last result and runs again whenever an applied change touches a
// table its query reads.

type QueryCell = {
  name: string;
  query: QueryState;
  // Re-binding the same query is a no-op.
  queryKey: string;
  sql: ReturnType<typeof compileQuery>;
  value: unknown;
};

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

// Runs the cell's query and returns whether it succeeded. A failing query
// keeps its last value.
function run(cell: QueryCell): boolean {
  try {
    cell.value = aqlCompiledQuery(
      cell.query,
      cell.sql.sqlPieces,
      cell.sql.state,
    );
    return true;
  } catch (e) {
    logger.warn(`Failed running ${cell.name}!`, e);
    return false;
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

  const cell: QueryCell = {
    name,
    query,
    queryKey,
    sql: compileQuery(query, schema, schemaConfig),
    value: existing?.value ?? null,
  };
  cells.set(name, cell);
  if (run(cell)) {
    notify([cell]);
  }
}

export function triggerQueryCells(tables: Set<string>) {
  const changed: QueryCell[] = [];
  for (const cell of cells.values()) {
    if (cell.sql.state.dependencies.some(dep => tables.has(dep)) && run(cell)) {
      changed.push(cell);
    }
  }
  notify(changed);
}

export function clearQueryCells() {
  cells.clear();
}
