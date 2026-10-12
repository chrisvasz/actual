// Tests run on the Node platform, which has no outbox. This mock keeps
// one in memory so tests can check what `applyMessages` logs and replay
// it with `replayOutbox`. Nothing is recorded until `_capture(true)`.

import type * as T from '#platform/server/persistence';
import type { OutboxBatch } from '#platform/server/persistence';

let capturing = false;
let batches: OutboxBatch[] = [];
let pending: OutboxBatch[] = [];

export function _capture(enabled: boolean) {
  capturing = enabled;
  batches = [];
  pending = [];
}

export function _getBatches(): OutboxBatch[] {
  return batches;
}

// What the next `readPendingBatches` returns
export function _setPending(next: OutboxBatch[]) {
  pending = next;
}

export const recordBatch: typeof T.recordBatch = makeBatch => {
  if (capturing) {
    batches.push(structuredClone(makeBatch()));
  }
};

export const readPendingBatches: typeof T.readPendingBatches = async () =>
  structuredClone(pending);

export const markReplayed: typeof T.markReplayed = () => {
  // Nothing to track
};

export const snapshot: typeof T.snapshot = async () => {
  // Nothing to snapshot
};

export const flush: typeof T.flush = async () => {
  // Nothing to flush
};
