// Durable storage for the web backend.
//
// The open budget's SQLite database lives entirely in memory (sql.js).
// Two things make it durable, both in IndexedDB (see ./storage.ts):
//
// - Snapshots: the whole database file, with the last outbox seq it
//   includes.
// - The outbox: every message batch `applyMessages` commits (local edits
//   and batches received from the server, in every syncing mode),
//   appended with a contiguous, increasing seq.
//
// On open, the snapshot is loaded and the server replays outbox batches
// newer than it through `applyMessages`, which rebuilds the data tables,
// the crdt log, clock/merkle and `messages_pending` exactly as they were.
// Nothing is snapshotted until that replay has succeeded (`markReplayed`):
// a snapshot drops the outbox entries it claims to include, in the same
// transaction, so snapshotting an unreplayed database would lose them.
//
// Durability semantics:
// - A message batch is durable once its outbox append commits. The
//   append starts synchronously when the batch commits in memory and
//   typically lands within milliseconds; a tab killed in that window
//   loses the batch. (IndexedDB's default durability: this survives a
//   tab or browser crash, not necessarily an OS crash.)
// - Writes that bypass `applyMessages` (migrations, clock setup, sync
//   reset, ...) aren't in the outbox. The code making them awaits
//   `snapshot()` or `flush()`, so they're durable once that resolves.
//   Any such write also marks the database dirty (SQLite's change count),
//   so the next idle, close or tab-hidden snapshot includes it anyway.
// - Snapshots are otherwise taken after writes go idle (bounded by a
//   maximum delay and an outbox length) and on `flush()` (budget close,
//   tab hidden). They bound the outbox and boot replay time.
// - If an append fails, appending stops until a snapshot succeeds, so
//   the outbox never has a hole that later batches would be replayed
//   across.
//
// Only one tab may own the storage: the app takes a Web Lock before
// starting the worker (`platform/client/browser-preload/start.ts`). Web
// Locks need a secure context, so `init` refuses to run without one.

import { captureException } from '#platform/exceptions';
import * as connection from '#platform/server/connection';
import * as idb from '#platform/server/indexeddb';
import { logger } from '#platform/server/log';

import * as storage from './storage';
import type { OutboxBatch } from './types';

export type { OutboxBatch, OutboxMessage } from './types';

// Snapshot once writes have been idle this long...
const SNAPSHOT_IDLE_MS = 5_000;
// ...but at least this often while writes keep coming (and this long
// after a failed snapshot)
const SNAPSHOT_MAX_DELAY_MS = 60_000;
// ...and as soon as the outbox holds this many batches, which bounds
// replay time on boot
const SNAPSHOT_MAX_PENDING_BATCHES = 500;

let storageDb: IDBDatabase | null = null;

// Directories whose files are persisted; everything else (bundled data,
// uploads) only lives in the in-memory filesystem
const persistedRoots = new Set<string>(['/documents']);

export async function init() {
  // Without Web Locks a second tab couldn't be kept from overwriting this
  // one's data. The page checks this too, before starting the worker.
  if (globalThis.isSecureContext === false) {
    throw new Error(
      'insecure-context: Actual must be served over HTTPS (or from localhost)',
    );
  }
  storageDb = await idb.openDatabase();
  // Not awaited: startup doesn't depend on it
  void idb.deleteLegacyDatabases();
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
  // SQLite's `total_changes()`: rows changed since the database opened
  totalChanges: () => number;
};

type OpenDatabase = DatabaseHooks & {
  path: string;
  // The last outbox seq the stored snapshot includes
  snapshotSeq: number;
  // The seq of the last batch appended to the outbox
  lastSeq: number;
  // `totalChanges()` when the stored snapshot was taken
  changesAtSnapshot: number;
  // Outbox replay has finished, so the in-memory database includes
  // every outbox batch and may be snapshotted
  replayed: boolean;
  // An append failed; appending is paused until a snapshot succeeds
  appendFailed: boolean;
  // The last snapshot attempt failed; retry slowly
  snapshotFailed: boolean;
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
        changesAtSnapshot: hooks.totalChanges(),
        replayed: false,
        appendFailed: false,
        snapshotFailed: false,
        pendingAppends: new Set(),
        snapshotting: null,
        timer: null,
        firstDirtyAt: null,
      };
    },
  };
}

// Stops persisting the database; returns whether it was the open one.
// Call `flush` first to snapshot it. Anything not snapshotted stays in
// the outbox and is replayed on the next open.
export function detach(handle: unknown): boolean {
  if (current && current.handle === handle) {
    if (current.timer) {
      clearTimeout(current.timer);
    }
    current = null;
    return true;
  }
  return false;
}

function isDirty(db: OpenDatabase) {
  return (
    db.lastSeq > db.snapshotSeq ||
    db.appendFailed ||
    db.totalChanges() !== db.changesAtSnapshot
  );
}

function scheduleSnapshot(db: OpenDatabase, delay: number) {
  const now = Date.now();
  if (db.firstDirtyAt == null) {
    db.firstDirtyAt = now;
  }
  const at = db.snapshotFailed
    ? now + SNAPSHOT_MAX_DELAY_MS
    : Math.min(now + delay, db.firstDirtyAt + SNAPSHOT_MAX_DELAY_MS);
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

// For promises whose failures have already been reported
function ignoreResult() {
  // Nothing to do
}

function reportWriteError(error: unknown) {
  logger.error('Failed to persist changes', error);
  captureException(error instanceof Error ? error : new Error(String(error)));
  connection.send('storage-write-error');
}

// With `force`, always writes a snapshot or rejects. Otherwise only
// writes when there is something to save, and defers when it can't yet.
async function takeSnapshot(db: OpenDatabase, force: boolean): Promise<void> {
  while (db.snapshotting) {
    await db.snapshotting;
  }
  if (current !== db) {
    if (force) {
      throw new Error('The database was closed before it was saved');
    }
    return;
  }
  if (!db.replayed) {
    // The outbox has batches this database doesn't include yet
    if (force) {
      throw new Error('Cannot snapshot before the outbox is replayed');
    }
    return;
  }
  if (!force && !isDirty(db)) {
    return;
  }
  if (db.inTransaction()) {
    // A transaction spanning handler calls (the API's batch import) is
    // open; the file isn't consistent until it commits
    if (force) {
      throw new Error('Cannot snapshot inside an open transaction');
    }
    scheduleSnapshot(db, 100);
    return;
  }

  // Capture everything synchronously, at one consistent point
  const seq = db.lastSeq;
  const changes = db.totalChanges();
  const bytes = db.getBytes();
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
    db.changesAtSnapshot = changes;
    db.appendFailed = false;
    db.snapshotFailed = false;
    logger.info(
      `Snapshot of ${db.path} (${(bytes.byteLength / 1e6).toFixed(1)} MB) ` +
        `written in ${Math.round(performance.now() - start)}ms`,
    );
  } catch (e) {
    db.snapshotFailed = true;
    reportWriteError(e);
    throw e;
  } finally {
    db.snapshotting = null;
    if (current === db && isDirty(db)) {
      scheduleSnapshot(db, SNAPSHOT_IDLE_MS);
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

  if (db.appendFailed) {
    // Keep the outbox free of holes: this batch is only saved by the
    // next snapshot
    scheduleSnapshot(db, 0);
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
      db.appendFailed = true;
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
// include, oldest first. Rejects if any are missing: replaying the ones
// after a hole could leave rows half-written.
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
  entries.forEach((entry, i) => {
    const expected = db.snapshotSeq + 1 + i;
    if (entry.seq !== expected) {
      throw new Error(
        `Outbox for ${db.path} is missing batches ${expected}-${entry.seq - 1}`,
      );
    }
  });
  return entries.map(entry => entry.batch);
}

// Call once every batch from `readPendingBatches` has been applied. Until
// then nothing is snapshotted.
export function markReplayed() {
  if (current) {
    current.replayed = true;
  }
}

// Snapshots the open database now. Await it after writes that bypass
// the outbox. Rejects if the snapshot can't be written.
export async function snapshot(): Promise<void> {
  if (current) {
    await takeSnapshot(current, true);
  }
}

// Waits for pending outbox appends, then snapshots the open database if
// anything changed since its last snapshot. Rejects if that snapshot
// fails; the outbox still holds every logged batch.
export async function flush(): Promise<void> {
  const db = current;
  if (db == null || !db.replayed) {
    return;
  }
  await Promise.all(db.pendingAppends);
  await takeSnapshot(db, false);
}

// Files, for the filesystem layer

function openBytes(db: OpenDatabase): Uint8Array {
  if (db.inTransaction()) {
    throw new Error('Cannot read the open database inside a transaction');
  }
  return db.getBytes();
}

export async function readFile(path: string): Promise<Uint8Array | null> {
  if (isDatabasePath(path)) {
    if (current && current.path === path) {
      return openBytes(current);
    }
    const db = getStorage();
    const stored = await storage.readSnapshot(db, path);
    if (stored && (await storage.maxOutboxSeq(db, path)) > stored.outboxSeq) {
      // The snapshot alone is missing edits; opening the budget replays
      // them and saves a complete snapshot
      throw new Error(
        'The budget has changes that are not saved yet; open it first: ' + path,
      );
    }
    return stored ? stored.bytes : null;
  }
  return storage.readFile(getStorage(), path);
}

function assertNotOpen(path: string, action: string) {
  if (current && current.path === path) {
    throw new Error(`Cannot ${action} the file of the open database: ${path}`);
  }
}

// Replacing a database file drops its outbox: the new file starts a new
// history
export async function writeFile(path: string, bytes: Uint8Array) {
  if (isDatabasePath(path)) {
    assertNotOpen(path, 'replace');
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
    assertNotOpen(path, 'remove');
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
