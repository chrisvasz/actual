// The link between the browser app and its backend, which runs on the
// page's main thread. The client connection
// (`platform/client/connection/index.main-thread.ts`) and the backend's
// connection (`platform/server/connection/index.main-thread.ts`) each
// install a receiver on it and call the other side's directly.
//
// The two sides live in separate bundles (the page, and the backend
// bundle it imports), so this is a plain object rather than a module
// both import.
//
// Delivery keeps the semantics the old Worker boundary had: messages are
// copied with `structuredClone` when sent, so neither side ever holds a
// reference to the other's objects, and are received in a later
// microtask, in the order they were sent. A handler never runs nested
// inside UI code (or another handler's synchronous part), and events a
// handler pushes still arrive before its reply.
//
// The backend also installs `reads`, synchronous reads the client calls
// directly, with no copy and no delay (see `server/live-reads.ts`).

import type { QueryState } from '#shared/query';

export type RequestMessage = {
  id: string;
  name: string;
  args: unknown;
  undoTag: unknown;
  catchErrors: boolean;
};

export type ServerMessage = { type: string; id?: string } & Record<
  string,
  unknown
>;

/**
 * What a change to the open budget wrote: the tables, and the ids of the
 * rows written in each (deleted rows too, since a delete is a tombstone).
 * `ids` is keyed by the table the rows are in, so `schedules_next_date`
 * rows appear under that name though `tables` reports them as
 * `schedules`. `cells` names (as `<sheet>!<name>`) every cell whose value
 * the change changed; a change can change cells and no table, like the
 * budget covering another month. `'all'` when a budget opened or closed:
 * anything may have changed.
 */
export type BudgetChanges =
  | 'all'
  | {
      tables: readonly string[];
      ids: Readonly<Record<string, readonly string[]>>;
      cells: readonly string[];
    };

/** Synchronous reads of the open budget, installed by the backend. */
export type LiveReads = {
  /**
   * Run an AQL query now. Returns its rows (a single value for a
   * `calculate` query) and the tables it read; with no budget open, no
   * rows and no tables. Throws the error shape a rejected `send('query')`
   * has. The query state is the caller's own object, uncopied: a read
   * must not change it.
   */
  query(query: QueryState): { data: unknown; dependencies: string[] };
  /**
   * Run the named read an app registered (`registerLiveReads`) now, with
   * `args`. Returns its result and the tables it reads, like `query`.
   */
  read(name: string, args: unknown): { data: unknown; dependencies: string[] };
  /**
   * Read the cell `<sheetName>!<name>` now: a budget value, or with
   * `query`, the result of that query, which binds the cell to it (see
   * `server/cells/query-cells.ts`). Null with no budget open. Throws like
   * `query`. A cell's value changes only with a change that lists it in
   * `cells`.
   */
  cell(sheetName: string, name: string, query?: QueryState): unknown;
  /**
   * Say nothing reads the cell `<sheetName>!<name>` bound to `query` any
   * more, so the backend can stop keeping it current; a cell since bound to
   * another query is kept.
   */
  releaseCell(sheetName: string, name: string, query: QueryState): void;
  /**
   * Call `listener` after each change to the open budget is committed,
   * before anything else can read it.
   */
  onChanges(listener: (changes: BudgetChanges) => void): () => void;
};

export type InProcessChannel = {
  /** Installed by the backend's connection; receives client requests. */
  server: ((msg: RequestMessage) => void) | null;
  /** Installed by the client connection; receives replies and events. */
  client: ((msg: ServerMessage) => void) | null;
  /** Installed by the backend; synchronous reads of the open budget. */
  reads: LiveReads | null;
};

export function createInProcessChannel(): InProcessChannel {
  return { server: null, client: null, reads: null };
}

/**
 * Copy `msg` now and hand it to `receive` in a microtask. Throws a
 * `DataCloneError` synchronously, like `postMessage`, if it can't be
 * copied.
 */
export function deliver<M>(receive: (msg: M) => void, msg: M): void {
  const copy = structuredClone(msg);
  queueMicrotask(() => receive(copy));
}
