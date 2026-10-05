import type { Query, QueryClient, QueryMeta } from '@tanstack/react-query';

/**
 * The tables a cached query reads, declared in its `meta`. A sync event that
 * lists one of them invalidates the query (see `sync-events.ts`).
 *
 * - A query on a handler that runs raw SQL lists them up front, from
 *   `handlerReads` in loot-core.
 * - A query on AQL reads them from its cached data: the server's reply lists
 *   them, so its data keeps the reply's `dependencies` (an `AqlSnapshot`) and
 *   its `meta` points at them with `snapshotDependencies`.
 */
export type QueryDependencies =
  | readonly string[]
  | ((data: unknown) => readonly string[] | undefined);

declare module '@tanstack/react-query' {
  // An interface, so this merges into TanStack's `Register`
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    queryMeta: {
      dependencies?: QueryDependencies;
      /**
       * Only refetch for changes synced from other devices ('success'
       * events), for a screen that applies its own changes some other way.
       */
      ignoreAppliedEvents?: boolean;
    };
  }
}

/** Rows read by AQL, and the tables they were read from. */
export type AqlSnapshot<T> = {
  data: T;
  dependencies: string[];
};

/** The tables an `AqlSnapshot` was read from. */
export function snapshotDependencies(data: unknown): string[] | undefined {
  if (
    data != null &&
    typeof data === 'object' &&
    'dependencies' in data &&
    Array.isArray(data.dependencies)
  ) {
    return data.dependencies;
  }
  return undefined;
}

/**
 * Whether `query` reads any of `tables`. A query whose dependencies come with
 * its data but that has none yet counts as reading every table: the fetch
 * that's running may have started before the change.
 */
export function readsAnyTable(
  query: { meta: QueryMeta | undefined; state: { data: unknown } },
  tables: readonly string[],
) {
  const declared = query.meta?.dependencies;
  if (declared == null) {
    return false;
  }
  const dependencies =
    typeof declared === 'function' ? declared(query.state.data) : declared;
  return (
    dependencies == null || tables.some(table => dependencies.includes(table))
  );
}

/** The tables a sync event says changed, and whether it was a sync. */
type SyncChange = {
  type: 'applied' | 'success';
  tables: readonly string[];
};

/**
 * Whether a sync event should refetch `query`: it reads a table the event
 * changed, and doesn't ignore the event's type.
 */
export function isAffectedBy(query: Query, { type, tables }: SyncChange) {
  return (
    !(type === 'applied' && query.meta?.ignoreAppliedEvents) &&
    readsAnyTable(query, tables)
  );
}

/**
 * Refetches every query that reads a table a sync event changed. Queries that
 * nothing shows are refetched too, so a screen that suspends on one later
 * doesn't draw once with data known to be out of date.
 *
 * A fetch that's already running may have read the rows before the change, so
 * it's restarted. TanStack's `cancelRefetch` only does that for a query with
 * data to keep showing meanwhile; one still loading would join the running
 * fetch instead, so cancel that fetch first.
 */
export async function invalidateQueriesReading(
  queryClient: QueryClient,
  event: SyncChange,
) {
  const predicate = (query: Query) => isAffectedBy(query, event);
  await queryClient.cancelQueries({
    predicate: query =>
      query.state.data === undefined &&
      query.state.fetchStatus !== 'idle' &&
      predicate(query),
  });
  await queryClient.invalidateQueries({ predicate, refetchType: 'all' });
}
