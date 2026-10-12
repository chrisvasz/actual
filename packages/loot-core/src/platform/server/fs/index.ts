import { join } from '#platform/server/fs/path-join';
import * as persistence from '#platform/server/persistence';
import { _getModule } from '#platform/server/sqlite';
import type { SqlJsModule } from '#platform/server/sqlite';

import { _setDocumentDir as _setDocumentDirShared } from './shared';

// The web filesystem. The directory tree lives in sql.js's in-memory
// filesystem. Files under a persisted root (`/documents` or a custom
// document dir) are only placeholders there: their contents live in
// IndexedDB, database files as snapshots (see
// `#platform/server/persistence`). Everything else (bundled data,
// uploads) only exists in memory.

let FS: SqlJsModule['FS'] | null = null;

export const bundledDatabasePath: string = '/default-db.sqlite';
export const migrationsPath: string = '/migrations';
export const demoBudgetPath: string = '/demo-budget';
export { join };
export { getDocumentDir, getBudgetDir } from './shared';
export const getDataDir = () => process.env.ACTUAL_DATA_DIR;

function getFS() {
  if (FS == null) {
    throw new Error('fs.init must be called first');
  }
  return FS;
}

export const _setDocumentDir = (dir: string) => {
  if (typeof dir === 'string' && dir.replace(/\/+$/, '') !== '') {
    persistence.addPersistedRoot(dir);
    if (FS) {
      _mkdirRecursively(dir);
    }
  }
  return _setDocumentDirShared(dir);
};

function _exists(filepath: string): boolean {
  try {
    getFS().stat(filepath);
    return true;
  } catch {
    return false;
  }
}

function _mkdirRecursively(dir: string) {
  const parts = dir.split('/').filter(str => str !== '');
  let path = '';
  for (const part of parts) {
    path += '/' + part;
    if (!_exists(path)) {
      getFS().mkdir(path);
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
    if (!_exists(filepath)) {
      throw new Error('File does not exist: ' + filepath);
    }
    contents = await readPersisted(filepath);
  } else {
    contents = getFS().readFile(filepath, { encoding: 'binary' });
  }
  return encoding === 'utf8' ? new TextDecoder().decode(contents) : contents;
}

export const writeFile = async function (
  filepath: string,
  contents: string | ArrayBuffer | Uint8Array,
): Promise<boolean> {
  const bytes = toBytes(contents);

  if (persistence.isPersistedPath(filepath)) {
    // The placeholder gives the file a place in the directory tree (and
    // fails like a real write when the directory doesn't exist)
    getFS().writeFile(filepath, '');
    await persistence.writeFile(filepath, bytes);
  } else {
    getFS().writeFile(filepath, bytes);
  }
  return true;
};

export const removeFile = async function (filepath: string) {
  if (persistence.isPersistedPath(filepath)) {
    await persistence.removeFile(filepath);
  }
  getFS().unlink(filepath);
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
    getFS().writeFile(path, '');
  }
}

export const init = async function () {
  FS = _getModule().FS;
  await persistence.init();

  // When a user "uploads" a file, we just put it in memory in this
  // dir and the backend takes it from there
  FS.mkdir('/uploads');

  // Files in /documents are persisted
  FS.mkdir('/documents');

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
  const paths = getFS().readdir(filepath);
  return paths.filter(p => p !== '.' && p !== '..');
};

export const exists = async function (filepath: string) {
  return _exists(filepath);
};

export const mkdir = async function (filepath: string) {
  getFS().mkdir(filepath);
};

export const size = async function (filepath: string) {
  if (persistence.isPersistedPath(filepath)) {
    return (await readPersisted(filepath)).byteLength;
  }
  return getFS().stat(filepath).size;
};

export const removeDir = async function (filepath: string) {
  getFS().rmdir(filepath);
};

export const removeDirRecursively = async function (dirpath: string) {
  if (await exists(dirpath)) {
    for (const file of await listDir(dirpath)) {
      const fullpath = join(dirpath, file);
      const attr = getFS().stat(fullpath);

      if (getFS().isDir(attr.mode)) {
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
