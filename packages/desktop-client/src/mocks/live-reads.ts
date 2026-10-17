// Stand-in for `@actual-app/core/platform/client/live-reads` in
// desktop-client tests (installed in `setupTests.ts`), which have no
// backend. A test answers queries and named reads with `initLiveReads` and
// reports changes with `changeTables`.

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

let handler: QueryHandler | null = null;
let readHandler: ReadHandler | null = null;
let listeners = new Set<(changes: BudgetChanges) => void>();

/** Answer live queries with `queryHandler`, and named reads with `onRead`. */
export function initLiveReads(
  queryHandler: QueryHandler | null,
  onRead: ReadHandler | null = null,
) {
  handler = queryHandler;
  readHandler = onRead;
}

export function clearLiveReads() {
  handler = null;
  readHandler = null;
  listeners = new Set();
}

/** Report a change to `tables`, as the backend does after applying one. */
export function changeTables(
  tables: readonly string[] | 'all',
  ids: Record<string, string[]> = {},
) {
  const changes: BudgetChanges = tables === 'all' ? 'all' : { tables, ids };
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

export const onChanges = (listener: (changes: BudgetChanges) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
