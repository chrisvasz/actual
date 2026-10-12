import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import * as connection from '#platform/server/connection';
import * as idb from '#platform/server/indexeddb';
import * as sqlite from '#platform/server/sqlite';

import * as storage from './storage';

import * as persistence from './index';

vi.mock('#platform/server/connection', () => ({ send: vi.fn() }));
vi.mock('#platform/exceptions', () => ({ captureException: vi.fn() }));

const DB_PATH = '/documents/budget/db.sqlite';

type SqlDatabase = Awaited<ReturnType<typeof sqlite.openDatabase>>;

beforeAll(async () => {
  await sqlite.init({
    baseURL: `${__dirname}/../../../../../../node_modules/@sqlite.org/sqlite-wasm/dist/`,
  });
});

beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  await persistence.init();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await idb.closeDatabase();
});

// A database with enough rows to span many pages
async function createDatabaseFile() {
  const db = await sqlite.openDatabase();
  sqlite.execQuery(
    db,
    `CREATE TABLE notes (id TEXT PRIMARY KEY, note TEXT);
     WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
     INSERT INTO notes SELECT 'n' || i, printf('%.200c', 'x') FROM n;`,
  );
  const bytes = await sqlite.exportDatabase(db);
  sqlite.closeDatabase(db);
  await persistence.writeFile(DB_PATH, bytes);
}

function setNote(db: SqlDatabase, id: string, note: string) {
  sqlite.runQuery(db, 'UPDATE notes SET note = ? WHERE id = ?', [note, id]);
}

function readNote(db: SqlDatabase, id: string) {
  return sqlite.runQuery<{ note: string }>(
    db,
    'SELECT note FROM notes WHERE id = ?',
    [id],
    true,
  )[0]?.note;
}

async function storedFile() {
  return storage.readPages(await idb.openDatabase(), DB_PATH);
}

describe('web persistence', () => {
  it('writes every commit and loads it back', async () => {
    await createDatabaseFile();
    let db = await sqlite.openDatabase(DB_PATH);
    setNote(db, 'n1', 'one');
    sqlite.transaction(db, () => {
      setNote(db, 'n2', 'two');
      setNote(db, 'n3', 'three');
    });
    await persistence.flush();
    sqlite.closeDatabase(db);

    db = await sqlite.openDatabase(DB_PATH);
    expect(readNote(db, 'n1')).toBe('one');
    expect(readNote(db, 'n2')).toBe('two');
    expect(readNote(db, 'n3')).toBe('three');
    sqlite.closeDatabase(db);
  });

  it('writes only the pages a commit changed', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    const write = vi.spyOn(storage, 'writePages');

    setNote(db, 'n1000', 'changed');
    await persistence.flush();

    expect(write).toHaveBeenCalledTimes(1);
    const [, , pages, pageCount] = write.mock.calls[0];
    expect(pageCount).toBeGreaterThan(100);
    expect(pages.size).toBeLessThan(5);
    sqlite.closeDatabase(db);
  });

  it('merges commits made while a write is running', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    const write = vi.spyOn(storage, 'writePages');

    setNote(db, 'n1', 'one');
    setNote(db, 'n2', 'two');
    setNote(db, 'n3', 'three');
    await persistence.flush();

    // The first commit's write, then one for the other two
    expect(write).toHaveBeenCalledTimes(2);
    expect(await storedFile()).toEqual(await persistence.readFile(DB_PATH));
    sqlite.closeDatabase(db);
  });

  it('drops the pages a VACUUM removes', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    sqlite.execQuery(db, "DELETE FROM notes WHERE id != 'n1'");
    sqlite.execQuery(db, 'VACUUM');
    await persistence.flush();

    const stored = await storedFile();
    const current = await persistence.readFile(DB_PATH);
    expect(stored?.byteLength).toBeLessThan(20 * storage.PAGE_SIZE);
    expect(stored).toEqual(current);
    sqlite.closeDatabase(db);
  });

  it('rewrites the whole file after a failed write', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    vi.spyOn(storage, 'writePages').mockRejectedValueOnce(
      new DOMException('Quota exceeded', 'QuotaExceededError'),
    );

    setNote(db, 'n1', 'lost');
    await vi.waitFor(() =>
      expect(connection.send).toHaveBeenCalledWith('storage-write-error'),
    );

    setNote(db, 'n2', 'next');
    await persistence.flush();
    sqlite.closeDatabase(db);

    const reopened = await sqlite.openDatabase(DB_PATH);
    expect(readNote(reopened, 'n1')).toBe('lost');
    expect(readNote(reopened, 'n2')).toBe('next');
    sqlite.closeDatabase(reopened);
  });

  it('protects the file of the open database', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    expect(await persistence.listFiles()).toEqual([DB_PATH]);

    // Reading it returns the open database's current contents
    setNote(db, 'n1', 'current');
    const copy = await sqlite.openDatabase(
      (await persistence.readFile(DB_PATH)) ?? new Uint8Array(),
    );
    expect(readNote(copy, 'n1')).toBe('current');
    sqlite.closeDatabase(copy);

    await expect(
      persistence.writeFile(DB_PATH, new Uint8Array([1])),
    ).rejects.toThrow('open database');
    await expect(persistence.removeFile(DB_PATH)).rejects.toThrow(
      'open database',
    );
    await persistence.flush();
    sqlite.closeDatabase(db);

    await persistence.removeFile(DB_PATH);
    expect(await persistence.listFiles()).toEqual([]);
    await expect(sqlite.openDatabase(DB_PATH)).rejects.toThrow('not found');
  });
});
