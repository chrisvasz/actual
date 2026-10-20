import type { BudgetChanges } from '#platform/in-process-channel';
import type { Query } from '#shared/query';
import type {
  LiveReadArgs,
  LiveReadData,
  LiveReadName,
} from '#types/live-reads';

export type { BudgetChanges, LiveReadArgs, LiveReadData, LiveReadName };

/**
 * Run an AQL query now, against the backend on this thread. Returns its
 * rows (a single value for a `calculate` query) and the tables it read;
 * with no budget open, no rows and no tables. Throws the error a rejected
 * `send('query')` has, or an `Error` if the backend hasn't started.
 */
export declare function runQuerySync<Data = unknown>(
  query: Query,
): { data: Data; dependencies: readonly string[] };
export type RunQuerySync = typeof runQuerySync;

/**
 * Run the backend's named read `name` now, with `args`. Returns its result
 * and the tables it reads; with no budget open, an empty result and no
 * tables. Throws like `runQuerySync`.
 */
export declare function readSync<Name extends LiveReadName>(
  name: Name,
  ...args: undefined extends LiveReadArgs<Name>
    ? [args?: LiveReadArgs<Name>]
    : [args: LiveReadArgs<Name>]
): { data: LiveReadData<Name>; dependencies: readonly string[] };
export type ReadSync = typeof readSync;

/**
 * Read the cell `<sheetName>!<name>` now: a budget value, or with `query`,
 * that query's result, binding the cell to it until `releaseCellSync`.
 * Null with no budget open. Throws like `runQuerySync`. Its value changes
 * only with a change that lists it in `cells`.
 */
export declare function readCellSync(
  sheetName: string,
  name: string,
  query?: Query,
): unknown;
export type ReadCellSync = typeof readCellSync;

/**
 * Say nothing reads the cell `<sheetName>!<name>` bound to `query` any more,
 * so the backend can stop keeping it current.
 */
export declare function releaseCellSync(
  sheetName: string,
  name: string,
  query: Query,
): void;
export type ReleaseCellSync = typeof releaseCellSync;

/**
 * Call `listener`, synchronously, after each change the backend commits,
 * with the tables and rows it wrote and the cells it changed (or `'all'`).
 * Returns a function that stops listening.
 */
export declare function onChanges(
  listener: (changes: BudgetChanges) => void,
): () => void;
export type OnChanges = typeof onChanges;
