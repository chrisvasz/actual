// One message as stored in the outbox. Timestamps and values are kept in
// their wire forms (`Timestamp#toString()` and `serializeValue`), so a
// batch is plain data that structured-clones cheaply.
export type OutboxMessage = {
  // Null for import-mode messages, which may have no timestamp
  timestamp: string | null;
  dataset: string;
  row: string;
  column: string;
  value: string;
};

// One successful `applyMessages` call, with everything needed to replay
// it exactly: the syncing mode decides whether the crdt log, clock and
// merkle were written, and `deferUnknownSchema` whether unknown-schema
// messages went to `messages_pending`.
export type OutboxBatch = {
  mode: 'enabled' | 'offline' | 'disabled' | 'import';
  deferUnknownSchema: boolean;
  // The serialized clock (timestamp + merkle) after the batch committed.
  // Only set when the batch wrote `messages_clock`.
  clock: string | null;
  messages: OutboxMessage[];
};
