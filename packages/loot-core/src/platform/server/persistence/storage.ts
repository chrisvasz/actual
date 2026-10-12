import * as idb from '#platform/server/indexeddb';

import type { OutboxBatch } from './types';

// IndexedDB layout (all keyed by file path):
// - `snapshots`: path → Snapshot, the whole database file plus the last
//   outbox seq it includes
// - `outbox`: [path, seq] → OutboxEntry, applied message batches
// - `budgetFiles`: path → bytes, every other persisted file
//
// Each write is one transaction, so it commits completely or not at all.
// Transactions on overlapping stores run in the order they were created,
// so appends, snapshots and truncations land in the order issued.

export type Snapshot = { outboxSeq: number; bytes: Uint8Array };
export type OutboxEntry = { path: string; seq: number; batch: OutboxBatch };

function outboxRange(path: string, upToSeq = Infinity, afterSeq = -Infinity) {
  return IDBKeyRange.bound([path, afterSeq], [path, upToSeq], true, false);
}

export async function readSnapshot(
  db: IDBDatabase,
  path: string,
): Promise<Snapshot | null> {
  const store = db.transaction('snapshots').objectStore('snapshots');
  return (await idb.promisifyRequest(store.get(path))) ?? null;
}

// Stores a snapshot and drops the outbox entries up to `truncateUpTo`
// (by default, the ones it includes), atomically
export async function writeSnapshot(
  db: IDBDatabase,
  path: string,
  snapshot: Snapshot,
  truncateUpTo = snapshot.outboxSeq,
): Promise<void> {
  const trans = db.transaction(['snapshots', 'outbox'], 'readwrite');
  trans.objectStore('snapshots').put(snapshot, path);
  trans.objectStore('outbox').delete(outboxRange(path, truncateUpTo));
  return idb.transactionDone(trans);
}

export async function removeSnapshot(
  db: IDBDatabase,
  path: string,
): Promise<void> {
  const trans = db.transaction(['snapshots', 'outbox'], 'readwrite');
  trans.objectStore('snapshots').delete(path);
  trans.objectStore('outbox').delete(outboxRange(path));
  return idb.transactionDone(trans);
}

export async function listSnapshots(db: IDBDatabase): Promise<string[]> {
  const store = db.transaction('snapshots').objectStore('snapshots');
  return (await idb.promisifyRequest(store.getAllKeys())) as string[];
}

// Creates the transaction synchronously, so the append is queued even
// if the caller never awaits. A failure to even start the transaction
// (like quota errors) becomes a rejection. Resolves once the entry is committed.
export async function appendOutbox(
  db: IDBDatabase,
  entry: OutboxEntry,
): Promise<void> {
  const trans = db.transaction('outbox', 'readwrite');
  // `add`, not `put`: a seq collision means two writers, and must fail
  // rather than overwrite a batch
  trans.objectStore('outbox').add(entry);
  return idb.transactionDone(trans);
}

// Entries with seq > `afterSeq`, oldest first
export async function readOutbox(
  db: IDBDatabase,
  path: string,
  afterSeq: number,
): Promise<OutboxEntry[]> {
  const store = db.transaction('outbox').objectStore('outbox');
  return idb.promisifyRequest<OutboxEntry[]>(
    store.getAll(outboxRange(path, Infinity, afterSeq)),
  );
}

export async function maxOutboxSeq(
  db: IDBDatabase,
  path: string,
): Promise<number> {
  const store = db.transaction('outbox').objectStore('outbox');
  const cursor = await idb.promisifyRequest(
    store.openKeyCursor(outboxRange(path), 'prev'),
  );
  return cursor ? (cursor.key as [string, number])[1] : 0;
}

export async function readFile(
  db: IDBDatabase,
  path: string,
): Promise<Uint8Array | null> {
  const store = db.transaction('budgetFiles').objectStore('budgetFiles');
  return (await idb.promisifyRequest(store.get(path))) ?? null;
}

export async function writeFile(
  db: IDBDatabase,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const trans = db.transaction('budgetFiles', 'readwrite');
  trans.objectStore('budgetFiles').put(bytes, path);
  return idb.transactionDone(trans);
}

export async function removeFile(db: IDBDatabase, path: string): Promise<void> {
  const trans = db.transaction('budgetFiles', 'readwrite');
  trans.objectStore('budgetFiles').delete(path);
  return idb.transactionDone(trans);
}

export async function listFiles(db: IDBDatabase): Promise<string[]> {
  const store = db.transaction('budgetFiles').objectStore('budgetFiles');
  return (await idb.promisifyRequest(store.getAllKeys())) as string[];
}
