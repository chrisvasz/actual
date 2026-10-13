import * as idb from '#platform/server/indexeddb';
import { logger } from '#platform/server/log';
import { isDevelopmentEnvironment } from '#shared/environment';

// IndexedDB layout:
// - `pages`: [path, n] → bytes [n * PAGE_SIZE, (n + 1) * PAGE_SIZE) of a
//   database file. Only the last page of a file may be shorter.
// - `budgetFiles`: path → bytes, every other persisted file
//
// Each write is one transaction, so it commits completely or not at all.

export const PAGE_SIZE = 4096;

function pageRange(path: string, from = 0) {
  return IDBKeyRange.bound([path, from], [path, Infinity]);
}

function ownsBuffer(view: Uint8Array): boolean {
  return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength;
}

// `bytes`, or a copy of it that owns its own ArrayBuffer. IndexedDB
// clones the whole ArrayBuffer behind a view, and `Buffer#slice` returns
// a view, so storing slices of a large `Buffer` would store the whole
// file each time.
function compactCopy(bytes: Uint8Array): Uint8Array {
  return ownsBuffer(bytes) ? bytes : new Uint8Array(bytes);
}

let hasLoggedView = false;

// Every value put into IndexedDB goes through here. Callers are expected
// to pass compact bytes already (see `compactCopy`); a view means one of
// them regressed, so fail loudly outside production and copy inside it.
function checkOwnsBuffer(view: Uint8Array, key: string): Uint8Array {
  if (ownsBuffer(view)) {
    return view;
  }
  const message = `IndexedDB write of a ${view.byteLength}-byte view into a ${view.buffer.byteLength}-byte buffer (${key})`;
  // (The browser bundle has no NODE_ENV, so production is "neither")
  if (isDevelopmentEnvironment() || process.env.NODE_ENV === 'test') {
    throw new Error(message);
  }
  if (!hasLoggedView) {
    hasLoggedView = true;
    logger.warn(message + '; storing a copy');
  }
  return new Uint8Array(view);
}

// Splits a whole file into pages
export function toPages(bytes: Uint8Array): Map<number, Uint8Array> {
  const pages = new Map<number, Uint8Array>();
  for (let n = 0; n * PAGE_SIZE < bytes.byteLength; n++) {
    pages.set(
      n,
      compactCopy(bytes.subarray(n * PAGE_SIZE, (n + 1) * PAGE_SIZE)),
    );
  }
  return pages;
}

export async function readPages(
  db: IDBDatabase,
  path: string,
): Promise<Uint8Array | null> {
  const store = db.transaction('pages').objectStore('pages');
  const pages = await idb.promisifyRequest<Uint8Array[]>(
    store.getAll(pageRange(path)),
  );
  if (pages.length === 0) {
    return null;
  }
  const bytes = new Uint8Array(
    pages.reduce((size, page) => size + page.byteLength, 0),
  );
  let offset = 0;
  for (const page of pages) {
    bytes.set(page, offset);
    offset += page.byteLength;
  }
  return bytes;
}

// Stores `pages` and drops every page at or after `pageCount`
export async function writePages(
  db: IDBDatabase,
  path: string,
  pages: Map<number, Uint8Array>,
  pageCount: number,
): Promise<void> {
  const values = [...pages].map(
    ([n, page]) => [n, checkOwnsBuffer(page, `${path} page ${n}`)] as const,
  );
  const trans = db.transaction('pages', 'readwrite');
  const store = trans.objectStore('pages');
  for (const [n, page] of values) {
    store.put(page, [path, n]);
  }
  store.delete(pageRange(path, pageCount));
  return idb.transactionDone(trans);
}

export async function removePages(db: IDBDatabase, path: string) {
  const trans = db.transaction('pages', 'readwrite');
  trans.objectStore('pages').delete(pageRange(path));
  return idb.transactionDone(trans);
}

// Paths of the stored database files
export async function listDatabases(db: IDBDatabase): Promise<string[]> {
  const store = db.transaction('pages').objectStore('pages');
  const paths: string[] = [];
  return new Promise((resolve, reject) => {
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor == null) {
        resolve(paths);
        return;
      }
      const path = (cursor.key as [string, number])[0];
      paths.push(path);
      // Skip the rest of this file's pages
      cursor.continue([path, Infinity]);
    };
    req.onerror = () => reject(req.error);
  });
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
  const value = checkOwnsBuffer(compactCopy(bytes), path);
  const trans = db.transaction('budgetFiles', 'readwrite');
  trans.objectStore('budgetFiles').put(value, path);
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
