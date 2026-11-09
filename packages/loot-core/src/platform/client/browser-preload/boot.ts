// The first thing the page runs (desktop-client's `src/boot.ts`, a small
// script of its own so it doesn't wait for the app's bundle). It takes the
// backend's Web Lock and starts reading the last open budget's database
// out of IndexedDB, so the bytes are ready by the time the backend opens
// that budget.
//
// Nothing here may import other modules: this file ends up in the small
// script, which has to stay small to start early.

// Only one tab at a time may run the backend. The backend keeps the open
// budget in memory and owns its snapshots and outbox; a second tab would
// load its own copy, and the two would drift apart and overwrite each
// other's snapshots. The tab that gets this lock holds it until the page
// unloads.
const BACKEND_LOCK_NAME = 'actual-backend';

// Where the backend keeps budgets: `getBudgetDir` under the browser's
// document dir (`ACTUAL_DOCUMENT_DIR` + '/Actual'). If they ever differ,
// the read is only wasted; `loadDatabase` checks the path.
export const BUDGETS_DIR = '/documents/Actual';

/** A database file's stored pages, in order. */
export type PrefetchedDatabase = { path: string; pages: Uint8Array[] };

export type Boot = {
  /** False when another tab is already running the backend. */
  hasLock: boolean;
  /** The last open budget's database, or null when there's none to read. */
  database: Promise<PrefetchedDatabase | null>;
};

let boot: Promise<Boot> | null = null;

/**
 * Takes the backend's lock and, once it's held, starts reading the last
 * open budget's database. Runs once; later calls return the same result.
 * Needs a secure context (for Web Locks).
 */
export function startBoot(): Promise<Boot> {
  boot ??= new Promise(resolve => {
    navigator.locks
      .request(BACKEND_LOCK_NAME, { ifAvailable: true }, lock => {
        if (!lock) {
          resolve({ hasLock: false, database: Promise.resolve(null) });
          return;
        }
        // Read only while holding the lock, so no other tab can change
        // the file before this one's backend opens it
        resolve({ hasLock: true, database: readLastBudget() });
        return new Promise<never>(() => {
          // Never settle, so the lock is held for the life of the page.
        });
      })
      // The request rejects when the browser blocks storage for this site.
      // Start anyway so the backend reports the real storage error.
      .catch(() => resolve({ hasLock: true, database: Promise.resolve(null) }));
  });
  return boot;
}

/**
 * Reads the stored pages of the last open budget's database. Resolves to
 * null, never rejects, when there's nothing to read or reading fails: the
 * backend then reads the file itself.
 */
export function readLastBudget(): Promise<PrefetchedDatabase | null> {
  return new Promise(resolve => {
    let req: IDBOpenDBRequest;
    try {
      // No version: open whatever is there. The backend upgrades it.
      req = indexedDB.open('actual');
    } catch {
      resolve(null);
      return;
    }
    // There's no database yet. Don't create one: the backend does that,
    // at its own version.
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const done = (result: PrefetchedDatabase | null) => {
        db.close();
        resolve(result);
      };
      // Let the backend's upgrade through
      db.onversionchange = () => done(null);
      if (
        !db.objectStoreNames.contains('asyncStorage') ||
        !db.objectStoreNames.contains('pages')
      ) {
        done(null);
        return;
      }
      const trans = db.transaction(['asyncStorage', 'pages']);
      trans.onabort = () => done(null);
      const lastBudget = trans.objectStore('asyncStorage').get('lastBudget');
      lastBudget.onsuccess = () => {
        const id: unknown = lastBudget.result;
        if (typeof id !== 'string' || !/^[A-Za-z0-9\-_]+$/.test(id)) {
          done(null);
          return;
        }
        const path = `${BUDGETS_DIR}/${id}/db.sqlite`;
        // The same key range as `persistence/storage`'s `pageRange`
        const pages = trans
          .objectStore('pages')
          .getAll(IDBKeyRange.bound([path, 0], [path, Infinity]));
        pages.onsuccess = () =>
          done(pages.result.length > 0 ? { path, pages: pages.result } : null);
      };
    };
  });
}
