import type { InProcessChannel, LiveReads } from '#platform/in-process-channel';

import type * as T from './index-types';

// Synchronous reads from the browser app's backend, which runs on the
// page's main thread (see `server/live-reads.ts`). Only built for the
// `main-thread` condition: a backend in a Worker can't answer
// synchronously.

let reads: LiveReads | null = null;
const listeners = new Set<(tables: T.ChangedTables) => void>();

/** Called by the client connection once the backend has started. */
export function connectLiveReads(channel: InProcessChannel) {
  if (reads || !channel.reads) {
    return;
  }
  reads = channel.reads;
  reads.onTablesChanged(tables => {
    for (const listener of [...listeners]) {
      listener(tables);
    }
  });
}

export const runQuerySync: T.RunQuerySync = function (query) {
  if (!reads) {
    throw new Error('The backend has not been started');
  }
  // oxlint-disable-next-line typescript/no-explicit-any -- typed by the caller
  return reads.query(query.serialize()) as any;
};

export const onTablesChanged: T.OnTablesChanged = function (listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
