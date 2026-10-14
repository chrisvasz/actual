import type { BudgetChanges } from '#platform/in-process-channel';
import type { Query } from '#shared/query';

export type { BudgetChanges };

/**
 * Run an AQL query now, against the backend on this thread. Returns its
 * rows (a single value for a `calculate` query) and the tables it read;
 * with no budget open, no rows and no tables. Throws the error a rejected `send('query')` has, or an `Error` if the
 * backend hasn't started.
 */
export declare function runQuerySync<Data = unknown>(
  query: Query,
): { data: Data; dependencies: readonly string[] };
export type RunQuerySync = typeof runQuerySync;

/**
 * Call `listener`, synchronously, after each change the backend commits,
 * with the tables and rows it wrote (or `'all'`). Returns a function that
 * stops listening.
 */
export declare function onChanges(
  listener: (changes: BudgetChanges) => void,
): () => void;
export type OnChanges = typeof onChanges;
