import { join } from '#platform/server/fs/path-join';
import * as persistence from '#platform/server/persistence';

import { _setDocumentDir as _setDocumentDirShared } from './shared';

// The web filesystem. The directory tree lives in memory. Files under a
// persisted root (`/documents` or a custom document dir) are only
// placeholders there: their contents live in IndexedDB (see
// `#platform/server/persistence`). Everything else (bundled data,
// uploads) only exists in memory.

// A file's contents are null when they're persisted
type Entry = { type: 'dir' } | { type: 'file'; contents: Uint8Array | null };

let entries: Map<string, Entry> | null = null;

export const bundledDatabasePath: string = '/default-db.sqlite';
export const migrationsPath: string = '/migrations';
export const demoBudgetPath: string = '/demo-budget';
export { join };
export { getDocumentDir, getBudgetDir } from './shared';
export const getDataDir = () => process.env.ACTUAL_DATA_DIR;

function getEntries() {
  if (entries == null) {
    throw new Error('fs.init must be called first');
  }
  return entries;
}

function normalize(filepath: string): string {
  const path = ('/' + filepath).replace(/\/+/g, '/').replace(/\/$/, '');
  return path === '' ? '/' : path;
}

function getEntry(filepath: string): Entry | undefined {
  const path = normalize(filepath);
  return path === '/' ? { type: 'dir' } : getEntries().get(path);
}

function getFile(filepath: string): Uint8Array | null {
  const entry = getEntry(filepath);
  if (entry == null || entry.type === 'dir') {
    throw new Error('File does not exist: ' + filepath);
  }
  return entry.contents;
}

function putFile(filepath: string, contents: Uint8Array | null) {
  const dir = getEntry(basename(normalize(filepath)));
  if (dir == null || dir.type !== 'dir') {
    throw new Error('Directory does not exist: ' + basename(filepath));
  }
  getEntries().set(normalize(filepath), { type: 'file', contents });
}

export const _setDocumentDir = (dir: string) => {
  if (typeof dir === 'string' && dir.replace(/\/+$/, '') !== '') {
    persistence.addPersistedRoot(dir);
    if (entries) {
      _mkdirRecursively(dir);
    }
  }
  return _setDocumentDirShared(dir);
};

function _exists(filepath: string): boolean {
  return getEntry(filepath) != null;
}

function _mkdirRecursively(dir: string) {
  const parts = dir.split('/').filter(str => str !== '');
  let path = '';
  for (const part of parts) {
    path += '/' + part;
    if (!_exists(path)) {
      getEntries().set(path, { type: 'dir' });
    }
  }
}

function toBytes(contents: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof contents === 'string') {
    return new TextEncoder().encode(contents);
  } else if (contents instanceof ArrayBuffer) {
    return new Uint8Array(contents);
  }
  return contents;
}

async function readPersisted(filepath: string): Promise<Uint8Array> {
  const contents = await persistence.readFile(filepath);
  if (contents == null) {
    throw new Error('File does not exist: ' + filepath);
  }
  return contents;
}

export async function readFile(
  filepath: string,
  encoding?: 'utf8',
): Promise<string>;
export async function readFile(
  filepath: string,
  encoding: 'binary',
): Promise<Uint8Array>;
export async function readFile(
  filepath: string,
  encoding: 'binary' | 'utf8' = 'utf8',
): Promise<string | Uint8Array> {
  let contents: Uint8Array;
  if (persistence.isPersistedPath(filepath)) {
    getFile(filepath);
    contents = await readPersisted(filepath);
  } else {
    contents = getFile(filepath) ?? new Uint8Array();
  }
  return encoding === 'utf8' ? new TextDecoder().decode(contents) : contents;
}

export const writeFile = async function (
  filepath: string,
  contents: string | ArrayBuffer | Uint8Array,
): Promise<boolean> {
  const bytes = toBytes(contents);

  if (persistence.isPersistedPath(filepath)) {
    // Fail like a real write when the directory doesn't exist
    if (!_exists(basename(filepath))) {
      throw new Error('Directory does not exist: ' + basename(filepath));
    }
    await persistence.writeFile(filepath, bytes);
    // The placeholder gives the file a place in the directory tree
    putFile(filepath, null);
  } else {
    putFile(filepath, bytes.slice());
  }
  return true;
};

export const removeFile = async function (filepath: string) {
  if (persistence.isPersistedPath(filepath)) {
    await persistence.removeFile(filepath);
  }
  getFile(filepath);
  getEntries().delete(normalize(filepath));
};

export const copyFile = async function (
  frompath: string,
  topath: string,
): Promise<boolean> {
  return writeFile(topath, await readFile(frompath, 'binary'));
};

// Load files from the server that should exist by default
async function populateDefaultFilesystem() {
  const index = await (
    await fetch(process.env.PUBLIC_URL + 'data-file-index.txt')
  ).text();
  const files = index
    .split('\n')
    .map(name => name.trim())
    .filter(name => name !== '');
  const fetchFile = (url: string) => fetch(url).then(res => res.arrayBuffer());

  // This is hardcoded. We know we must create the migrations
  // directory, it's not worth complicating the index to support
  // creating arbitrary folders.
  await mkdir('/migrations');
  await mkdir('/demo-budget');

  await Promise.all(
    files.map(async file => {
      const contents = await fetchFile(process.env.PUBLIC_URL + 'data/' + file);
      // `.data` lets shipped JS files escape bundler import-analysis.
      await writeFile('/' + file.replace(/\.data$/, ''), contents);
    }),
  );
}

// Recreate placeholders for every persisted file
async function populateFileHierarchy() {
  for (const path of await persistence.listFiles()) {
    _mkdirRecursively(basename(path));
    putFile(path, null);
  }
}

export const init = async function () {
  entries = new Map();
  await persistence.init();

  // When a user "uploads" a file, we just put it in memory in this
  // dir and the backend takes it from there
  await mkdir('/uploads');

  // Files in /documents are persisted
  await mkdir('/documents');

  // We don't populate the default files in testing
  if (process.env.NODE_ENV !== 'test') {
    await populateDefaultFilesystem();
  }

  await populateFileHierarchy();
};

export const basename = function (filepath: string) {
  const parts = filepath.split('/');
  return parts.slice(0, -1).join('/');
};

export const listDir = async function (filepath: string) {
  const entry = getEntry(filepath);
  if (entry == null || entry.type !== 'dir') {
    throw new Error('Directory does not exist: ' + filepath);
  }
  const dir = normalize(filepath);
  const prefix = dir === '/' ? '/' : dir + '/';
  return [...getEntries().keys()]
    .filter(path => path.startsWith(prefix))
    .map(path => path.slice(prefix.length))
    .filter(name => !name.includes('/'));
};

export const exists = async function (filepath: string) {
  return _exists(filepath);
};

export const mkdir = async function (filepath: string) {
  if (_exists(filepath)) {
    throw new Error('File exists: ' + filepath);
  }
  const parent = getEntry(basename(normalize(filepath)));
  if (parent == null || parent.type !== 'dir') {
    throw new Error('Directory does not exist: ' + basename(filepath));
  }
  getEntries().set(normalize(filepath), { type: 'dir' });
};

export const size = async function (filepath: string) {
  if (persistence.isPersistedPath(filepath)) {
    return (await readPersisted(filepath)).byteLength;
  }
  return (getFile(filepath) ?? new Uint8Array()).byteLength;
};

export const removeDir = async function (filepath: string) {
  if ((await listDir(filepath)).length > 0) {
    throw new Error('Directory not empty: ' + filepath);
  }
  getEntries().delete(normalize(filepath));
};

export const removeDirRecursively = async function (dirpath: string) {
  if (await exists(dirpath)) {
    for (const file of await listDir(dirpath)) {
      const fullpath = join(dirpath, file);
      if (getEntry(fullpath)?.type === 'dir') {
        await removeDirRecursively(fullpath);
      } else {
        await removeFile(fullpath);
      }
    }

    await removeDir(dirpath);
  }
};

export const getModifiedTime = async (_filepath: string): Promise<Date> => {
  throw new Error(
    'getModifiedTime not supported on the web (only used for backups)',
  );
};
