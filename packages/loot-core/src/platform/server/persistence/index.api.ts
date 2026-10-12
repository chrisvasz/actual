// The Node backend writes straight to a database file on disk
// (better-sqlite3), so there's no snapshot or outbox to maintain.

import type * as T from './index';

export type { OutboxBatch, OutboxMessage } from './types';

export const recordBatch: typeof T.recordBatch = () => {
  // Nothing to record
};

export const readPendingBatches: typeof T.readPendingBatches = async () => [];

export const markReplayed: typeof T.markReplayed = () => {
  // Nothing to replay
};

export const snapshot: typeof T.snapshot = async () => {
  // Nothing to snapshot
};

export const flush: typeof T.flush = async () => {
  // Nothing to flush
};
