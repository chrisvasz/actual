import { useMemo, useSyncExternalStore } from 'react';
import type { DependencyList } from 'react';

import type { Query } from '@actual-app/core/shared/query';

import { getLiveQuery } from '#queries/liveStore';
import type { LiveResult } from '#queries/liveStore';

type UseLiveQueryResult<Row> = {
  /** The query's rows; null when there's no query. */
  data: null | ReadonlyArray<Row>;
  error?: Error;
};

const NO_RESULT: LiveResult<undefined> = { data: undefined };

function stopNothing() {
  // Nothing to stop
}

function subscribeToNothing() {
  return stopNothing;
}

function getNoResult() {
  return NO_RESULT;
}

/**
 * The rows of the query `makeQuery` returns, kept current as the tables it
 * reads change. Read synchronously, so there's no loading state: the first
 * render has the rows. `makeQuery` is called again only when `dependencies`
 * change; return null for no query.
 */
export function useLiveQuery<Row = unknown>(
  makeQuery: () => Query | null,
  dependencies: DependencyList,
): UseLiveQueryResult<Row> {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- caller owns deps
  const query = useMemo(makeQuery, dependencies);
  const result = useLiveResult<ReadonlyArray<Row>>(query);
  return useMemo(
    () => ({
      data: result.data ?? null,
      ...(result.error && { error: result.error }),
    }),
    [result],
  );
}

/** The live result of `query`, which the caller keeps stable. */
function useLiveResult<Data>(
  query: Query | null,
): LiveResult<Data | undefined> {
  const handle = query ? getLiveQuery<Data>(query) : null;
  return useSyncExternalStore<LiveResult<Data | undefined>>(
    handle ? handle.subscribe : subscribeToNothing,
    handle ? handle.getSnapshot : getNoResult,
  );
}
