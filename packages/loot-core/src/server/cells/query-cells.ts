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
  // Bumped on every run; a result only lands if no newer run has started.
  version: number;
};

const cells = new Map<string, QueryCell>();
const running = new Set<Promise<void>>();
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

function run(cell: QueryCell) {
  const version = ++cell.version;
  const promise = (async () => {
    try {
      const value = await aqlCompiledQuery(
        cell.query,
        cell.sql.sqlPieces,
        cell.sql.state,
      );
      // A newer run started, or the cell was cleared: drop this result.
      if (cell.version !== version || cells.get(cell.name) !== cell) {
        return;
      }
      cell.value = value;
      listener?.([{ name: cell.name, value }]);
    } catch (e) {
      logger.warn(`Failed running ${cell.name}!`, e);
    }
  })();
  running.add(promise);
  void promise.finally(() => running.delete(promise));
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
    version: 0,
  };
  cells.set(name, cell);
  run(cell);
}

export function triggerQueryCells(tables: Set<string>) {
  for (const cell of cells.values()) {
    if (cell.sql.state.dependencies.some(dep => tables.has(dep))) {
      run(cell);
    }
  }
}

export function clearQueryCells() {
  cells.clear();
}

// Resolves once every query that has started has finished.
export async function waitOnQueryCells(): Promise<void> {
  while (running.size > 0) {
    await Promise.all(running);
  }
}
