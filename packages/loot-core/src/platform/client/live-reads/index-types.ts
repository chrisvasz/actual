import type { Query } from '#shared/query';

/** The tables a change wrote, or `'all'` when a budget opened or closed. */
export type ChangedTables = readonly string[] | 'all';

/**
 * Run an AQL query now, against the backend on this thread. Returns its
 * rows (a single value for a `calculate` query) and the tables it read.
 * Throws the error a rejected `send('query')` has, or an `Error` if the
 * backend hasn't started.
 */
export declare function runQuerySync<Data = unknown>(
  query: Query,
): { data: Data; dependencies: readonly string[] };
export type RunQuerySync = typeof runQuerySync;

/**
 * Call `listener`, synchronously, after each change the backend applies,
 * with the tables it wrote. Returns a function that stops listening.
 */
export declare function onTablesChanged(
  listener: (tables: ChangedTables) => void,
): () => void;
export type OnTablesChanged = typeof onTablesChanged;
