import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { patchFetchForSqlJS } from '#mocks/util';
import * as idb from '#platform/server/indexeddb';
import * as sqlite from '#platform/server/sqlite';

import * as storage from './storage';
import type { OutboxBatch } from './types';

import * as persistence from './index';

vi.mock('#platform/server/connection', () => ({ send: vi.fn() }));
vi.mock('#platform/exceptions', () => ({ captureException: vi.fn() }));

const DB_PATH = '/documents/budget/db.sqlite';

type SqlDatabase = Awaited<ReturnType<typeof sqlite.openDatabase>>;

beforeAll(async () => {
  const baseURL = `${__dirname}/../../../../../../node_modules/@jlongster/sql.js/dist/`;
  patchFetchForSqlJS(baseURL);
  await sqlite.init({ baseURL });
});

beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  await persistence.init();
});

afterEach(async () => {
  await idb.closeDatabase();
});

function batch(value: string): OutboxBatch {
  return {
    mode: 'disabled',
    deferUnknownSchema: false,
    clock: null,
    messages: [
      {
        timestamp: '1970-01-01T00:00:00.000Z-0000-0000000000000000',
        dataset: 'notes',
        row: 'n1',
        column: 'note',
        value: 'S:' + value,
      },
    ],
  };
}

async function createDatabaseFile() {
  const db = await sqlite.openDatabase();
  sqlite.execQuery(db, 'CREATE TABLE notes (id TEXT PRIMARY KEY, note TEXT)');
  const bytes = await sqlite.exportDatabase(db);
  sqlite.closeDatabase(db);
  await persistence.writeFile(DB_PATH, bytes);
}

// A write as `applyMessages` makes it: applied, then logged
function applyNote(db: SqlDatabase, note: string) {
  sqlite.runQuery(db, 'INSERT OR REPLACE INTO notes VALUES (?, ?)', [
    'n1',
    note,
  ]);
  persistence.recordBatch(() => batch(note));
}

function readNote(db: SqlDatabase) {
  const rows = sqlite.runQuery<{ note: string }>(
    db,
    'SELECT note FROM notes',
    [],
    true,
  );
  return rows[0]?.note;
}

// The note in the stored snapshot
async function snapshotNote() {
  const stored = await storage.readSnapshot(await idb.openDatabase(), DB_PATH);
  const db = await sqlite.openDatabase(stored!.bytes);
  try {
    return readNote(db);
  } finally {
    sqlite.closeDatabase(db);
  }
}

// Reads are ordered after earlier un-awaited appends, so no waiting is
// needed before this
async function outboxSeqs() {
  const entries = await storage.readOutbox(
    await idb.openDatabase(),
    DB_PATH,
    0,
  );
  return entries.map(entry => entry.seq);
}

describe('outbox storage', () => {
  it('reads entries in seq order and truncates with a snapshot', async () => {
    const db = await idb.openDatabase();
    const other = '/documents/other/db.sqlite';
    // Issued without awaiting: transactions still commit in order
    const writes = [3, 1, 2, 4].map(seq =>
      storage.appendOutbox(db, { path: DB_PATH, seq, batch: batch('x') }),
    );
    writes.push(
      storage.appendOutbox(db, { path: other, seq: 1, batch: batch('x') }),
    );
    await Promise.all(writes);

    expect(await storage.maxOutboxSeq(db, DB_PATH)).toBe(4);
    expect(
      (await storage.readOutbox(db, DB_PATH, 1)).map(entry => entry.seq),
    ).toEqual([2, 3, 4]);

    await storage.writeSnapshot(db, DB_PATH, {
      outboxSeq: 2,
      bytes: new Uint8Array([1]),
    });
    expect(await outboxSeqs()).toEqual([3, 4]);

    await storage.removeSnapshot(db, DB_PATH);
    expect(await storage.readSnapshot(db, DB_PATH)).toBe(null);
    expect(await outboxSeqs()).toEqual([]);
    expect(await storage.maxOutboxSeq(db, other)).toBe(1);
  });
});

describe('persisting the open database', () => {
  it('keeps batches in the outbox until a snapshot covers them', async () => {
    await createDatabaseFile();

    let db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'one');
    applyNote(db, 'two');
    // Closed without a snapshot, as when the tab is killed
    sqlite.closeDatabase(db);

    db = await sqlite.openDatabase(DB_PATH);
    expect(readNote(db)).toBe(undefined);
    expect(await persistence.readPendingBatches()).toEqual([
      batch('one'),
      batch('two'),
    ]);

    // Replay (here: by hand), then snapshot
    applyNote(db, 'one');
    applyNote(db, 'two');
    await persistence.flush();
    sqlite.closeDatabase(db);

    // The snapshot write dropped every entry it includes
    expect(await outboxSeqs()).toEqual([]);

    db = await sqlite.openDatabase(DB_PATH);
    expect(readNote(db)).toBe('two');
    expect(await persistence.readPendingBatches()).toEqual([]);
    sqlite.closeDatabase(db);
  });

  it('continues seqs after the newest outbox entry', async () => {
    await createDatabaseFile();
    let db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'one');
    sqlite.closeDatabase(db);

    db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'two');
    sqlite.closeDatabase(db);

    expect(await outboxSeqs()).toEqual([1, 2]);
  });

  it('only snapshots on flush when the outbox has new batches', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);

    // A migration-style write, outside the outbox: flush can't see it...
    sqlite.runQuery(db, "INSERT INTO notes VALUES ('n1', 'direct')");
    await persistence.flush();
    expect(await snapshotNote()).toBe(undefined);

    // ...so the code making it snapshots explicitly
    await persistence.snapshot();
    expect(await snapshotNote()).toBe('direct');
    sqlite.closeDatabase(db);
  });

  it('serves the live database when the open file is read', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'live');

    const copy = await sqlite.openDatabase(
      (await persistence.readFile(DB_PATH))!,
    );
    expect(readNote(copy)).toBe('live');
    sqlite.closeDatabase(copy);

    await expect(
      persistence.writeFile(DB_PATH, new Uint8Array([1])),
    ).rejects.toThrow('open database');
    sqlite.closeDatabase(db);
  });

  it('waits for an open transaction before snapshotting', async () => {
    await createDatabaseFile();
    const db = await sqlite.openDatabase(DB_PATH);

    sqlite.beginTransaction(db);
    sqlite.runQuery(db, "INSERT INTO notes VALUES ('n1', 'pending')");
    await persistence.snapshot();
    expect(await snapshotNote()).toBe(undefined);
    sqlite.commitTransaction(db);

    await persistence.snapshot();
    expect(await snapshotNote()).toBe('pending');
    sqlite.closeDatabase(db);
  });

  it('keeps the snapshot and outbox when a snapshot write fails', async () => {
    await createDatabaseFile();
    let db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'one');

    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementationOnce(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    await expect(persistence.snapshot()).rejects.toThrow('Quota exceeded');
    put.mockRestore();
    sqlite.closeDatabase(db);

    db = await sqlite.openDatabase(DB_PATH);
    expect(readNote(db)).toBe(undefined);
    expect(await persistence.readPendingBatches()).toEqual([batch('one')]);
    sqlite.closeDatabase(db);
  });

  it('starts a new history when the file is replaced', async () => {
    await createDatabaseFile();
    let db = await sqlite.openDatabase(DB_PATH);
    applyNote(db, 'one');
    applyNote(db, 'two');
    sqlite.closeDatabase(db);

    // As a download or backup restore does
    await createDatabaseFile();
    expect(await outboxSeqs()).toEqual([]);

    db = await sqlite.openDatabase(DB_PATH);
    expect(await persistence.readPendingBatches()).toEqual([]);
    applyNote(db, 'three');
    sqlite.closeDatabase(db);
    expect(await outboxSeqs()).toEqual([1]);
  });
});
