// Stand-in for `@actual-app/core/platform/client/live-reads` in
// desktop-client tests (installed in `setupTests.ts`), which have no
// backend. A test answers queries, named reads and cells with
// `initLiveReads` and reports changes with `changeTables`.

import type {
  BudgetChanges,
  LiveReadName,
} from '@actual-app/core/platform/client/live-reads';
import type { Query, QueryState } from '@actual-app/core/shared/query';

type QueryHandler = (query: QueryState) => {
  data: unknown;
  dependencies: string[];
};

type ReadHandler = (
  name: LiveReadName,
  args: unknown,
) => { data: unknown; dependencies: string[] };

type CellHandlers = {
  read: (sheetName: string, name: string, query?: Query) => unknown;
  release?: (sheetName: string, name: string, query: Query) => void;
};

let handler: QueryHandler | null = null;
let readHandler: ReadHandler | null = null;
let cellHandlers: CellHandlers | null = null;
let listeners = new Set<(changes: BudgetChanges) => void>();

/**
 * Answer live queries with `queryHandler`, named reads with `onRead`, and
 * cell reads and releases with `cells`.
 */
export function initLiveReads(
  queryHandler: QueryHandler | null,
  onRead: ReadHandler | null = null,
  cells: CellHandlers | null = null,
) {
  handler = queryHandler;
  readHandler = onRead;
  cellHandlers = cells;
}

export function clearLiveReads() {
  handler = null;
  readHandler = null;
  cellHandlers = null;
  listeners = new Set();
}

/**
 * Report a change to `tables` (and `cells`), as the backend does after
 * applying one.
 */
export function changeTables(
  tables: readonly string[] | 'all',
  ids: Record<string, string[]> = {},
  cells: readonly string[] = [],
) {
  const changes: BudgetChanges =
    tables === 'all' ? 'all' : { tables, ids, cells };
  for (const listener of [...listeners]) {
    listener(changes);
  }
}

export const runQuerySync = (query: Query) => {
  if (!handler) {
    throw new Error('`runQuerySync` called with no mock reads installed');
  }
  // oxlint-disable-next-line typescript/no-explicit-any -- typed by the caller
  return handler(query.serialize()) as any;
};

export const readSync = (name: LiveReadName, args?: unknown) => {
  if (!readHandler) {
    throw new Error('`readSync` called with no mock reads installed');
  }
  // oxlint-disable-next-line typescript/no-explicit-any -- typed by the caller
  return readHandler(name, args) as any;
};

export const readCellSync = (
  sheetName: string,
  name: string,
  query?: Query,
) => {
  if (!cellHandlers) {
    throw new Error('`readCellSync` called with no mock reads installed');
  }
  return cellHandlers.read(sheetName, name, query);
};

export const releaseCellSync = (
  sheetName: string,
  name: string,
  query: Query,
) => {
  cellHandlers?.release?.(sheetName, name, query);
};

export const onChanges = (listener: (changes: BudgetChanges) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
