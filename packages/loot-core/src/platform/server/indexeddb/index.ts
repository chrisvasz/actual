import { logger } from '#platform/server/log';

let openedDb: null | Promise<IDBDatabase> = null;

// The web version keeps global prefs, budget files, database snapshots
// and the write outbox in IndexedDB
function _openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const dbVersion = 10;
    const openRequest = indexedDB.open('actual', dbVersion);

    openRequest.onupgradeneeded = function (e) {
      const db = (e.target as IDBOpenDBRequest).result;

      // Remove old stores
      for (const name of ['filesystem', 'messages']) {
        if (db.objectStoreNames.contains(name)) {
          db.deleteObjectStore(name);
        }
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
