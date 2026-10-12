import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import * as persistence from '#platform/server/persistence';

import * as idb from './index';

const LEGACY_DB = 'documents-My-Budget-1a2b3c-db.sqlite';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await idb.closeDatabase();
});

function openRaw(
  name: string,
  version: number,
  upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  const req = indexedDB.open(name, version);
  req.onupgradeneeded = () => upgrade?.(req.result);
  return idb.promisifyRequest(req);
}

async function put(
  db: IDBDatabase,
  store: string,
  key: string,
  value: unknown,
) {
  const trans = db.transaction(store, 'readwrite');
  trans.objectStore(store).put(value, key);
  await idb.transactionDone(trans);
}

async function get(db: IDBDatabase, store: string, key: string) {
  return idb.promisifyRequest(
    db.transaction(store).objectStore(store).get(key),
  );
}

async function databaseNames() {
  return (await indexedDB.databases()).map(info => info.name).sort();
}

// The `actual` database as #149 left it: the new stores, plus absurd-sql's
// `files` store
async function createVersion10Database() {
  const db = await openRaw('actual', 10, db => {
    db.createObjectStore('files', { keyPath: 'filepath' });
    db.createObjectStore('asyncStorage');
    db.createObjectStore('budgetFiles');
    db.createObjectStore('snapshots');
    db.createObjectStore('outbox', { keyPath: ['path', 'seq'] });
  });
  const trans = db.transaction('files', 'readwrite');
  trans.objectStore('files').put({
    filepath: '/documents/My-Budget-1a2b3c/metadata.json',
    contents: '{}',
  });
  await idb.transactionDone(trans);
  await put(db, 'asyncStorage', 'user-token', 'token');
  await put(db, 'budgetFiles', '/documents/b/metadata.json', 'meta');
  await put(db, 'snapshots', '/documents/b/db.sqlite', { outboxSeq: 0 });
  db.close();
}

describe('legacy absurd-sql storage', () => {
  it('deletes the files store and keeps the new stores on upgrade', async () => {
    await createVersion10Database();

    const db = await idb.openDatabase();

    expect(db.version).toBe(11);
    expect([...db.objectStoreNames].sort()).toEqual([
      'asyncStorage',
      'budgetFiles',
      'outbox',
      'snapshots',
    ]);
    expect(await get(db, 'asyncStorage', 'user-token')).toBe('token');
    expect(await get(db, 'budgetFiles', '/documents/b/metadata.json')).toBe(
      'meta',
    );
    expect(await get(db, 'snapshots', '/documents/b/db.sqlite')).toEqual({
      outboxSeq: 0,
    });
  });

  it('creates the new stores in a fresh database', async () => {
    const db = await idb.openDatabase();

    expect([...db.objectStoreNames].sort()).toEqual([
      'asyncStorage',
      'budgetFiles',
      'outbox',
      'snapshots',
    ]);
  });

  it('deletes the per-file databases and nothing else', async () => {
    (await openRaw(LEGACY_DB, 1)).close();
    (await openRaw('documents-Other-4d5e6f-db.sqlite', 1)).close();
    (await openRaw('unrelated', 1)).close();
    await idb.openDatabase();

    await idb.deleteLegacyDatabases();

    expect(await databaseNames()).toEqual(['actual', 'unrelated']);
  });

  it('deletes the per-file databases on init', async () => {
    (await openRaw(LEGACY_DB, 1)).close();

    await persistence.init();

    await vi.waitFor(async () => {
      expect(await databaseNames()).toEqual(['actual']);
    });
  });

  it('does nothing without indexedDB.databases', async () => {
    (await openRaw(LEGACY_DB, 1)).close();
    Object.defineProperty(indexedDB, 'databases', {
      value: undefined,
      configurable: true,
    });

    await idb.deleteLegacyDatabases();

    // Uncover the prototype's method again
    Reflect.deleteProperty(indexedDB, 'databases');
    expect(await databaseNames()).toEqual([LEGACY_DB]);
  });

  it('never matches a database the app uses', () => {
    expect(idb.isLegacyDatabaseName('actual')).toBe(false);
    expect(idb.isLegacyDatabaseName(LEGACY_DB)).toBe(true);
  });
});
