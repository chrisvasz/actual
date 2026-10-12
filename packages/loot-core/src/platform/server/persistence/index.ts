// Durable storage for the web backend.
//
// The open budget's SQLite database lives in memory (see
// `#platform/server/sqlite`). Every time SQLite commits, it hands over
// the 4 KB pages that changed and the new file size; they are written
// to IndexedDB (see ./storage.ts) in one transaction, and opening the
// database assembles the file from its stored pages.
//
// Durability semantics:
// - A commit is durable once its pages are written. The write starts as
//   soon as SQLite commits and typically lands within milliseconds; a
//   tab killed in that window loses the commit. (IndexedDB's default
//   durability: this survives a tab or browser crash, not necessarily
//   an OS crash.)
// - One write runs at a time. Commits made meanwhile are merged into the
//   next write, so the stored file always matches one commit.
// - If a write fails, the user is told, and the next commit (or `flush`)
//   rewrites the whole file.
//
// Only one tab may own the storage: the app takes a Web Lock before
// starting the backend (`platform/client/browser-preload/start.ts`). Web
// Locks need a secure context, so `init` refuses to run without one.

import { captureException } from '#platform/exceptions';
import * as connection from '#platform/server/connection';
import * as idb from '#platform/server/indexeddb';
import { logger } from '#platform/server/log';

import * as storage from './storage';

let storageDb: IDBDatabase | null = null;

// Directories whose files are persisted; everything else (bundled data,
// uploads) only lives in the in-memory filesystem
const persistedRoots = new Set<string>(['/documents']);

export async function init() {
  // Without Web Locks a second tab couldn't be kept from overwriting this
  // one's data. The page checks this too, before starting the backend.
  if (globalThis.isSecureContext === false) {
    throw new Error(
      'insecure-context: Actual must be served over HTTPS (or from localhost)',
    );
  }
  storageDb = await idb.openDatabase();
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

// Open databases

type OpenDatabase = {
  path: string;
  // The whole file, as of the last commit
  getBytes: () => Uint8Array;
  // Pages committed since the last write started, and the file size
  // after the last commit (null when nothing is waiting)
  pages: Map<number, Uint8Array>;
  size: number | null;
  writing: Promise<void> | null;
  // The last write failed, so the stored file is out of date
  failed: boolean;
};

const open = new Map<string, OpenDatabase>();

// Reads the database file at `path`
export async function loadDatabase(path: string): Promise<Uint8Array> {
  const bytes = await storage.readPages(getStorage(), path);
  if (bytes == null) {
    throw new Error('Database file not found: ' + path);
  }
  return bytes;
}

// Starts persisting the database at `path`. Call the returned function
// at every commit with the pages that changed and the new file size.
export function attach(
  path: string,
  getBytes: () => Uint8Array,
): (pages: Map<number, Uint8Array>, size: number) => void {
  if (open.has(path)) {
    throw new Error('Database is already open: ' + path);
  }
  const db: OpenDatabase = {
    path,
    getBytes,
    pages: new Map(),
    size: null,
    writing: null,
    failed: false,
  };
  open.set(path, db);
  return (pages, size) => {
    if (open.get(path) !== db) {
      return;
    }
    if (db.failed) {
      db.failed = false;
      db.pages = storage.toPages(getBytes());
    } else {
      for (const [n, page] of pages) {
        db.pages.set(n, page);
      }
    }
    db.size = size;
    db.writing ??= write(db);
  };
}

// Stops persisting the database at `path`. Call `flush` first to wait
// for its last commits.
export function detach(path: string) {
  open.delete(path);
}

function reportWriteError(error: unknown) {
  logger.error('Failed to persist changes', error);
  captureException(error instanceof Error ? error : new Error(String(error)));
  connection.send('storage-write-error');
}

async function write(db: OpenDatabase): Promise<void> {
  try {
    while (db.size != null) {
      const { pages, size } = db;
      db.pages = new Map();
      db.size = null;
      await storage.writePages(
        getStorage(),
        db.path,
        pages,
        Math.ceil(size / storage.PAGE_SIZE),
      );
    }
  } catch (e) {
    db.failed = true;
    db.pages = new Map();
    db.size = null;
    reportWriteError(e);
  } finally {
    db.writing = null;
  }
}

// Waits until every commit so far is stored, rewriting the whole file of
// a database whose last write failed. Call it outside a transaction.
// Rejects if a write fails.
export async function flush(): Promise<void> {
  for (const db of open.values()) {
    await db.writing;
    if (db.failed) {
      await writeWholeFile(db.path, db.getBytes());
      db.failed = false;
    }
  }
}

function writeWholeFile(path: string, bytes: Uint8Array) {
  return storage.writePages(
    getStorage(),
    path,
    storage.toPages(bytes),
    Math.ceil(bytes.byteLength / storage.PAGE_SIZE),
  );
}

// Files, for the filesystem layer

export async function readFile(path: string): Promise<Uint8Array | null> {
  if (isDatabasePath(path)) {
    const db = open.get(path);
    if (db) {
      return db.getBytes();
    }
    return storage.readPages(getStorage(), path);
  }
  return storage.readFile(getStorage(), path);
}

function assertNotOpen(path: string, action: string) {
  if (open.has(path)) {
    throw new Error(`Cannot ${action} the file of the open database: ${path}`);
  }
}

export async function writeFile(path: string, bytes: Uint8Array) {
  if (isDatabasePath(path)) {
    assertNotOpen(path, 'replace');
    await writeWholeFile(path, bytes);
  } else {
    await storage.writeFile(getStorage(), path, bytes);
  }
}

export async function removeFile(path: string) {
  if (isDatabasePath(path)) {
    assertNotOpen(path, 'remove');
    await storage.removePages(getStorage(), path);
  } else {
    await storage.removeFile(getStorage(), path);
  }
}

export async function listFiles(): Promise<string[]> {
  const db = getStorage();
  return [
    ...(await storage.listFiles(db)),
    ...(await storage.listDatabases(db)),
  ];
}
