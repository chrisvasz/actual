import { logger } from '#platform/server/log';

let openedDb: null | Promise<IDBDatabase> = null;

// The web version keeps global prefs, budget files, database snapshots
// and the write outbox in IndexedDB
function _openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const dbVersion = 11;
    const openRequest = indexedDB.open('actual', dbVersion);

    openRequest.onupgradeneeded = function (e) {
      const db = (e.target as IDBOpenDBRequest).result;

      // Remove old stores
      for (const name of ['filesystem', 'messages']) {
        if (db.objectStoreNames.contains(name)) {
          db.deleteObjectStore(name);
        }
      }
      // absurd-sql's file tree, kept for one release after budgets
      // stopped being read from it
      if (e.oldVersion < 11 && db.objectStoreNames.contains('files')) {
        db.deleteObjectStore('files');
      }

      // Create new stores (see `#platform/server/persistence`)
      if (!db.objectStoreNames.contains('asyncStorage')) {
        db.createObjectStore('asyncStorage');
      }
      if (!db.objectStoreNames.contains('budgetFiles')) {
        db.createObjectStore('budgetFiles');
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: ['path', 'seq'] });
      }
    };

    openRequest.onblocked = e => logger.log('blocked', e);

    openRequest.onerror = () => {
      logger.log('openRequest error');
      reject(new Error('indexeddb-failure: Could not open IndexedDB'));
    };

    openRequest.onsuccess = function (e) {
      const db = (e.target as IDBOpenDBRequest).result;

      db.onversionchange = () => {
        // TODO: Notify the user somehow
        db.close();
      };

      db.onerror = function (event) {
        const error = (event.target as IDBOpenDBRequest)?.error;
        logger.log('Database error:', error);

        if (event.target && error) {
          if (error.name === 'QuotaExceededError') {
            throw new Error('indexeddb-quota-error');
          }
        }
      };
      resolve(db);
    };
  });
}

// absurd-sql kept each database file in its own IndexedDB database, named
// after the file path (`documents-My-Budget-1a2b3c-db.sqlite`). None of
// the current databases end in `.sqlite`.
export function isLegacyDatabaseName(name: string): boolean {
  return name.endsWith('.sqlite');
}

// Deletes the absurd-sql per-file databases. Best-effort: failures are
// logged, and a deletion blocked by another tab finishes once it closes.
export async function deleteLegacyDatabases(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') {
    return;
  }
  try {
    const databases = await indexedDB.databases();
    const names = databases
      .map(info => info.name)
      .filter((name): name is string => !!name && isLegacyDatabaseName(name));
    await Promise.all(
      names.map(name =>
        promisifyRequest(indexedDB.deleteDatabase(name)).catch(e =>
          logger.warn(`Failed to delete legacy database ${name}`, e),
        ),
      ),
    );
  } catch (e) {
    logger.warn('Failed to delete legacy databases', e);
  }
}

export function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves once the transaction has committed
export function transactionDone(trans: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    trans.oncomplete = () => resolve();
    trans.onerror = () => reject(trans.error);
    trans.onabort = () =>
      reject(trans.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export const getDatabase = function () {
  return openDatabase();
};

export const openDatabase = function () {
  if (openedDb == null) {
    openedDb = _openDatabase();
  }
  return openedDb;
};

export const closeDatabase = async function () {
  if (openedDb) {
    await openedDb.then(db => {
      db.close();
    });
    openedDb = null;
  }
};
