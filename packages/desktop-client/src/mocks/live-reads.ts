// Stand-in for `@actual-app/core/platform/client/live-reads` in
// desktop-client tests (installed in `setupTests.ts`), which have no
// backend. A test answers queries with `initLiveReads` and reports
// changes with `changeTables`.

import type { BudgetChanges } from '@actual-app/core/platform/client/live-reads';
import type { Query, QueryState } from '@actual-app/core/shared/query';

type QueryHandler = (query: QueryState) => {
  data: unknown;
  dependencies: string[];
};

let handler: QueryHandler | null = null;
let listeners = new Set<(changes: BudgetChanges) => void>();

/** Answer live queries with `queryHandler`. */
export function initLiveReads(queryHandler: QueryHandler) {
  handler = queryHandler;
}

export function clearLiveReads() {
  handler = null;
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

export const onChanges = (listener: (changes: BudgetChanges) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
