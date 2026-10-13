import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import * as idb from '#platform/server/indexeddb';

import {
  _setDocumentDir,
  copyFile,
  exists,
  init,
  join,
  listDir,
  mkdir,
  readFile,
  removeDirRecursively,
  size,
  writeFile,
} from './index';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await idb.closeDatabase();
});

// Simulates a reload: a fresh in-memory filesystem over the same storage

async function storedKeys(store: 'budgetFiles' | 'databases') {
  const db = await idb.openDatabase();
  if (store === 'databases') {
    const keys = (await idb.promisifyRequest(
      db.transaction('pages').objectStore('pages').getAllKeys(),
    )) as Array<[string, number]>;
    return [...new Set(keys.map(([path]) => path))];
  }
  return (await idb.promisifyRequest(
    db.transaction(store).objectStore(store).getAllKeys(),
  )) as string[];
}

async function reinit() {
  await init();
}

describe('web filesystem', () => {
  test('files under /documents are persisted to the file store', async () => {
    await init();

    await writeFile('/documents/foo.txt', 'hello');
    expect(await readFile('/documents/foo.txt')).toBe('hello');
    expect(await storedKeys('budgetFiles')).toEqual(['/documents/foo.txt']);

    const bytes = new Uint8Array([1, 2, 3, 250]);
    await writeFile('/documents/foo.bin', bytes.buffer);
    // Compared as arrays: IndexedDB clones into another realm's Uint8Array
    expect([...(await readFile('/documents/foo.bin', 'binary'))]).toEqual([
      ...bytes,
    ]);
    expect(await size('/documents/foo.bin')).toBe(4);

    // Views are written from their offset, not the start of the buffer
    await writeFile('/documents/slice.bin', bytes.subarray(1, 3));
    expect([...(await readFile('/documents/slice.bin', 'binary'))]).toEqual([
      2, 3,
    ]);

    // Files outside of documents only live in memory
    await writeFile('/outside.txt', 'some junk');
    expect(await readFile('/outside.txt')).toBe('some junk');
    expect(await storedKeys('budgetFiles')).not.toContain('/outside.txt');
  });

  test('database files are stored as pages', async () => {
    await init();
    await writeFile('/documents/db.sqlite', 'some junk');

    expect(await readFile('/documents/db.sqlite')).toBe('some junk');
    expect(await storedKeys('budgetFiles')).toEqual([]);
    expect(await storedKeys('databases')).toEqual(['/documents/db.sqlite']);
    expect(await size('/documents/db.sqlite')).toBe(9);
  });

  test('files are restored after a reload', async () => {
    await init();
    await writeFile('/documents/ok.txt', 'oh yeah');
    _setDocumentDir('/documents/deep/nested');
    await writeFile('/documents/deep/nested/ok.txt', 'deeper');
    await writeFile('/documents/deep/nested/db.sqlite', 'database');

    await reinit();

    expect(await readFile('/documents/ok.txt')).toBe('oh yeah');
    expect(await exists('/documents/deep')).toBe(true);
    expect(await readFile('/documents/deep/nested/ok.txt')).toBe('deeper');
    expect(await readFile('/documents/deep/nested/db.sqlite')).toBe('database');
    expect((await listDir('/documents/deep/nested')).sort()).toEqual([
      'db.sqlite',
      'ok.txt',
    ]);
  });

  test('files under a custom document dir are persisted', async () => {
    await init();
    _setDocumentDir('/budget');
    expect(await exists('/budget')).toBe(true);

    await writeFile('/budget/foo.txt', 'hello');
    await writeFile('/budget/db.sqlite', 'some junk');
    expect(await storedKeys('budgetFiles')).toEqual(['/budget/foo.txt']);
    expect(await storedKeys('databases')).toEqual(['/budget/db.sqlite']);

    await reinit();
    _setDocumentDir('/budget');
    expect(await readFile('/budget/foo.txt')).toBe('hello');
    expect(await readFile('/budget/db.sqlite')).toBe('some junk');
  });

  test('copying and removing a budget directory', async () => {
    await init();
    await mkdir('/documents/a');
    await writeFile('/documents/a/metadata.json', '{}');
    await writeFile('/documents/a/db.sqlite', 'database');

    await copyFile('/documents/a/db.sqlite', '/documents/b.sqlite');
    expect(await readFile('/documents/b.sqlite')).toBe('database');

    await removeDirRecursively('/documents/a');
    expect(await exists('/documents/a')).toBe(false);
    expect(await storedKeys('budgetFiles')).toEqual([]);
    expect(await storedKeys('databases')).toEqual(['/documents/b.sqlite']);
  });

  test('writing into a missing directory fails', async () => {
    await init();
    await expect(writeFile('/documents/missing/x.txt', 'x')).rejects.toThrow();
    expect(await storedKeys('budgetFiles')).toEqual([]);
  });
});

describe('join', () => {
  test('basic join works', () => {
    expect(join('foo', 'bar')).toBe('foo/bar');
    expect(join('/foo', 'bar')).toBe('/foo/bar');
    expect(join('/foo', '../bar')).toBe('/bar');
  });
});
