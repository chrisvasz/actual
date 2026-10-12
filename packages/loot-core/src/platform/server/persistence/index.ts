// Durable storage for the web backend.
//
// The open budget's SQLite database lives entirely in memory (sql.js).
// Two things make it durable, both in IndexedDB (see ./storage.ts):
//
// - Snapshots: the whole database file, with the last outbox seq it
//   includes.
// - The outbox: every message batch `applyMessages` commits (local edits
//   and batches received from the server, in every syncing mode),
//   appended with an increasing seq.
//
// On open, the snapshot is loaded and the server replays outbox batches
// newer than it through `applyMessages`, which rebuilds the data tables,
// the crdt log, clock/merkle and `messages_pending` exactly as they were.
// A snapshot write also drops the outbox entries it includes, in the
// same transaction.
//
// Durability semantics:
// - A message batch is durable once its outbox append commits. The
//   append starts synchronously when the batch commits in memory and
//   typically lands within milliseconds; a tab killed in that window
//   loses the batch.
// - Writes that bypass `applyMessages` (migrations, clock setup, sync
//   reset, ...) aren't in the outbox. The code making them awaits
//   `snapshot()`, so they're durable once it resolves.
// - Snapshots are otherwise taken after writes go idle (bounded by a
//   maximum delay and an outbox length) and on `flush()` (budget close,
//   tab hidden). They only bound the outbox and boot replay time.
//
// Only one tab may run the backend (see the Web Lock in
// `platform/client/browser-preload/start.ts`), so a single writer owns
// the storage.

import { captureException } from '#platform/exceptions';
import * as connection from '#platform/server/connection';
import * as idb from '#platform/server/indexeddb';
import { logger } from '#platform/server/log';

import * as storage from './storage';
import type { OutboxBatch } from './types';

export type { OutboxBatch, OutboxMessage } from './types';

// Snapshot once writes have been idle this long...
const SNAPSHOT_IDLE_MS = 5_000;
// ...but at least this often while writes keep coming
const SNAPSHOT_MAX_DELAY_MS = 60_000;
// ...and as soon as the outbox holds this many batches, which bounds
// replay time on boot
const SNAPSHOT_MAX_PENDING_BATCHES = 500;

let storageDb: IDBDatabase | null = null;

// Directories whose files are persisted; everything else (bundled data,
// uploads) only lives in the in-memory filesystem
const persistedRoots = new Set<string>(['/documents']);

export async function init() {
  storageDb = await idb.openDatabase();
  void deleteLegacyDatabases();
}

// absurd-sql kept each database file in its own IndexedDB database,
// named after the file path (e.g. `documents-My-Budget-1a2b3c-db.sqlite`).
// Budgets stored that way aren't migrated: they are re-downloaded from
// the sync server.
async function deleteLegacyDatabases() {
  try {
    if (typeof indexedDB.databases !== 'function') {
      return;
    }
    for (const { name } of await indexedDB.databases()) {
      if (name && name.endsWith('.sqlite')) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch (e) {
    logger.warn('Failed to delete legacy databases', e);
  }
}

function getStorage(): IDBDatabase {
  if (storageDb == null) {
    throw new Error('persistence.init must be called first');
  }
  return storageDb;
}

function normalizePath(filepath: string): string {
  const absolute = filepath.startsWith('/') ? filepath : '/' + filepath;
  return absolute.replace(/\/+$/, '');
}

export function addPersistedRoot(dir: string) {
  persistedRoots.add(normalizePath(dir));
}

export function isPersistedPath(filepath: string): boolean {
  const path = normalizePath(filepath);
  return [...persistedRoots].some(
    root => path === root || path.startsWith(root + '/'),
  );
}

export function isDatabasePath(filepath: string): boolean {
  return isPersistedPath(filepath) && filepath.endsWith('.sqlite');
}

// The open database

type DatabaseHooks = {
  // The sql.js database, to match it in `detach`
  handle: unknown;
  // A copy of the current database file. Only consistent outside a
  // transaction.
  getBytes: () => Uint8Array;
  inTransaction: () => boolean;
};

type OpenDatabase = DatabaseHooks & {
  path: string;
  // The last outbox seq the stored snapshot includes
  snapshotSeq: number;
  // The seq of the last batch appended to the outbox
  lastSeq: number;
  // A snapshot was requested but couldn't be written yet
  needsSnapshot: boolean;
  pendingAppends: Set<Promise<void>>;
  snapshotting: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  firstDirtyAt: number | null;
};

let current: OpenDatabase | null = null;

// Reads the snapshot of the database at `path`. Call `attach` with the
// database opened from the returned bytes to start persisting it.
export async function loadDatabase(path: string) {
  const db = getStorage();
  const stored = await storage.readSnapshot(db, path);
  if (stored == null) {
    throw new Error('Database file not found: ' + path);
  }
  const maxSeq = await storage.maxOutboxSeq(db, path);

  return {
    bytes: stored.bytes,
    attach(hooks: DatabaseHooks) {
      if (current) {
        logger.warn('Attaching a database while another is still open');
        detach(current.handle);
      }
      current = {
        ...hooks,
        path,
        snapshotSeq: stored.outboxSeq,
        lastSeq: Math.max(maxSeq, stored.outboxSeq),
        needsSnapshot: false,
        pendingAppends: new Set(),
        snapshotting: null,
        timer: null,
        firstDirtyAt: null,
      };
    },
  };
}

// Stops persisting the database. Call `flush` first to snapshot it;
// anything not snapshotted stays in the outbox and is replayed on the
// next open.
export function detach(handle: unknown) {
  if (current && current.handle === handle) {
    if (current.timer) {
      clearTimeout(current.timer);
    }
    current = null;
  }
}

function isDirty(db: OpenDatabase) {
  return db.lastSeq > db.snapshotSeq || db.needsSnapshot;
}

function scheduleSnapshot(db: OpenDatabase, delay: number) {
  const now = Date.now();
  if (db.firstDirtyAt == null) {
    db.firstDirtyAt = now;
  }
  const at = Math.min(now + delay, db.firstDirtyAt + SNAPSHOT_MAX_DELAY_MS);
  if (db.timer) {
    clearTimeout(db.timer);
  }
  db.timer = setTimeout(
    () => {
      db.timer = null;
      takeSnapshot(db, false).catch(ignoreResult);
    },
    Math.max(0, at - now),
  );
}

// For promises whose failures `takeSnapshot` has already reported
function ignoreResult() {
  // Nothing to do
}

function reportWriteError(error: unknown) {
  logger.error('Failed to persist changes', error);
  captureException(error instanceof Error ? error : new Error(String(error)));
  connection.send('storage-write-error');
}

async function takeSnapshot(db: OpenDatabase, force: boolean): Promise<void> {
  while (db.snapshotting) {
    await db.snapshotting;
  }
  if (current !== db || !(force || isDirty(db))) {
    return;
  }
  if (db.inTransaction()) {
    // A transaction spanning handler calls (the API's batch import) is
    // open; the file isn't consistent until it commits
    db.needsSnapshot = true;
    scheduleSnapshot(db, 100);
    return;
  }

  // Capture everything synchronously, at one consistent point
  const seq = db.lastSeq;
  const bytes = db.getBytes();
  db.needsSnapshot = false;
  db.firstDirtyAt = null;
  if (db.timer) {
    clearTimeout(db.timer);
    db.timer = null;
  }

  const start = performance.now();
  const write = storage.writeSnapshot(getStorage(), db.path, {
    outboxSeq: seq,
    bytes,
  });
  db.snapshotting = write.then(ignoreResult, ignoreResult);

  try {
    await write;
    db.snapshotSeq = seq;
    logger.info(
      `Snapshot of ${db.path} (${(bytes.byteLength / 1e6).toFixed(1)} MB) ` +
        `written in ${Math.round(performance.now() - start)}ms`,
    );
  } catch (e) {
    // The outbox still has every batch, so only writes outside it are
    // at risk. Retry later rather than in a tight loop.
    db.needsSnapshot = true;
    reportWriteError(e);
    throw e;
  } finally {
    db.snapshotting = null;
    if (current === db && isDirty(db)) {
      scheduleSnapshot(
        db,
        db.needsSnapshot ? SNAPSHOT_MAX_DELAY_MS : SNAPSHOT_IDLE_MS,
      );
    }
  }
}

// Appends a committed batch to the outbox of the open database. Returns
// without waiting for the write. `makeBatch` runs synchronously, and
// only when there is an outbox to write to.
export function recordBatch(makeBatch: () => OutboxBatch): void {
  const db = current;
  if (db == null) {
    return;
  }

  db.lastSeq++;
  const append = storage
    .appendOutbox(getStorage(), {
      path: db.path,
      seq: db.lastSeq,
      batch: makeBatch(),
    })
    .catch(e => {
      reportWriteError(e);
      // The batch is only in memory now; a snapshot is its only way to
      // disk
      db.needsSnapshot = true;
      scheduleSnapshot(db, 0);
    });
  db.pendingAppends.add(append);
  void append.finally(() => db.pendingAppends.delete(append));

  const pending = db.lastSeq - db.snapshotSeq;
  scheduleSnapshot(
    db,
    pending >= SNAPSHOT_MAX_PENDING_BATCHES ? 0 : SNAPSHOT_IDLE_MS,
  );
}

// Outbox batches of the open database that its snapshot doesn't
// include, oldest first
export async function readPendingBatches(): Promise<OutboxBatch[]> {
  const db = current;
  if (db == null) {
    return [];
  }
  const entries = await storage.readOutbox(
    getStorage(),
    db.path,
    db.snapshotSeq,
  );
  return entries.map(entry => entry.batch);
}

// Snapshots the open database now. Await it after writes that bypass
// the outbox. Rejects if the snapshot can't be written.
export async function snapshot(): Promise<void> {
  if (current) {
    await takeSnapshot(current, true);
  }
}

// Waits for pending outbox appends, then snapshots the open database if
// the outbox has batches its snapshot doesn't include. Never rejects:
// the outbox still holds everything a failed snapshot would have.
export async function flush(): Promise<void> {
  const db = current;
  if (db == null) {
    return;
  }
  await Promise.all(db.pendingAppends);
  await takeSnapshot(db, false).catch(ignoreResult);
}

// Files, for the filesystem layer

export async function readFile(path: string): Promise<Uint8Array | null> {
  if (isDatabasePath(path)) {
    if (current && current.path === path) {
      return current.getBytes();
    }
    const stored = await storage.readSnapshot(getStorage(), path);
    return stored ? stored.bytes : null;
  }
  return storage.readFile(getStorage(), path);
}

// Replacing a database file drops its outbox: the new file starts a new
// history
export async function writeFile(path: string, bytes: Uint8Array) {
  if (isDatabasePath(path)) {
    if (current && current.path === path) {
      throw new Error('Cannot replace the file of the open database: ' + path);
    }
    await storage.writeSnapshot(
      getStorage(),
      path,
      { outboxSeq: 0, bytes },
      Infinity,
    );
  } else {
    await storage.writeFile(getStorage(), path, bytes);
  }
}

export async function removeFile(path: string) {
  if (isDatabasePath(path)) {
    if (current && current.path === path) {
      throw new Error('Cannot remove the file of the open database: ' + path);
    }
    await storage.removeSnapshot(getStorage(), path);
  } else {
    await storage.removeFile(getStorage(), path);
  }
}

export async function listFiles(): Promise<string[]> {
  const db = getStorage();
  return [
    ...(await storage.listFiles(db)),
    ...(await storage.listSnapshots(db)),
  ];
}
