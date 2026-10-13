import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type {
  Database,
  PreparedStatement,
  Sqlite3Static,
  SqlValue,
} from '@sqlite.org/sqlite-wasm';

import { logger } from '#platform/server/log';
import * as persistence from '#platform/server/persistence';

import * as memoryVfs from './memory-vfs';
import { normalise } from './normalise';
import type { SqlParam } from './types';
import { unicodeLike } from './unicodeLike';

export type { SqlParam } from './types';
export type { Database };
export type Statement = PreparedStatement;

let sqlite3: Sqlite3Static | null = null;

// Opt-in: when set, the wasm is instantiated from these bytes instead of being
// fetched via `locateFile`. The browser build of `@actual-app/api` uses this to
// ship a fully self-contained worker (no `sqlite3.wasm` request). Dormant for
// every other consumer (web app and Node build never call `setWasmBinary`).
let wasmBinaryOverride: ArrayBuffer | Uint8Array | undefined;

export function setWasmBinary(binary: ArrayBuffer | Uint8Array) {
  wasmBinaryOverride = binary;
}

export async function init({
  baseURL = process.env.PUBLIC_URL,
  wasmBinary = wasmBinaryOverride,
}: { baseURL?: string; wasmBinary?: ArrayBuffer | Uint8Array } = {}) {
  if (sqlite3) {
    return;
  }
  // The typings omit the Emscripten module options `init` takes
  const initModule = sqlite3InitModule as (options: {
    locateFile: (file: string) => string;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance) => void,
    ) => object;
    print: (message: string) => void;
    printErr: (message: string) => void;
  }) => Promise<Sqlite3Static>;
  sqlite3 = await initModule({
    locateFile: file => baseURL + file,
    ...(wasmBinary && {
      instantiateWasm(imports, receive) {
        void WebAssembly.instantiate(new Uint8Array(wasmBinary), imports).then(
          result => receive(result.instance),
        );
        return {};
      },
    }),
    print: message => logger.log(message),
    printErr: message => logger.error(message),
  });
  memoryVfs.install(sqlite3);
}

function getSqlite3(): Sqlite3Static {
  if (sqlite3 == null) {
    throw new Error('sqlite.init must be called first');
  }
  return sqlite3;
}

function verifyParamTypes(sql: string | Statement, arr: SqlParam[] = []) {
  arr.forEach(val => {
    if (typeof val !== 'string' && typeof val !== 'number' && val !== null) {
      throw new Error('Invalid field type ' + val + ' for sql ' + sql);
    }
  });
}

export function prepare(db: Database, sql: string) {
  return db.prepare(sql);
}

export function runQuery(
  db: Database,
  sql: string | Statement,
  params?: SqlParam[] | null,
  fetchAll?: false,
): { changes: unknown };
export function runQuery<T>(
  db: Database,
  sql: string | Statement,
  params: SqlParam[] | null | undefined,
  fetchAll: true,
): T[];
export function runQuery<T>(
  db: Database,
  sql: string | Statement,
  params: SqlParam[] | null = [],
  fetchAll = false,
): T[] | { changes: unknown } {
  if (params) {
    verifyParamTypes(sql, params);
  }

  const stmt = typeof sql === 'string' ? db.prepare(sql) : sql;
  try {
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    if (fetchAll) {
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.get({}) as T);
      }
      return rows;
    }
    stmt.step();
    return { changes: db.changes() };
  } catch (e) {
    logger.log(sql);
    throw e;
  } finally {
    if (typeof sql === 'string') {
      stmt.finalize();
    } else {
      stmt.reset(true);
    }
  }
}

export function execQuery(db: Database, sql: string) {
  db.exec(sql);
}

let transactionDepth = 0;

export type TransactionOptions = {
  // Take the write lock up front (`BEGIN IMMEDIATE`). Only matters for
  // file-backed databases with concurrent connections; kept so the
  // signature is the same on every platform.
  immediate?: boolean;
};

export function inTransaction() {
  return transactionDepth > 0;
}

export function transaction(
  db: Database,
  fn: () => void,
  { immediate = false }: TransactionOptions = {},
) {
  let before, after, undo;
  if (transactionDepth > 0) {
    before = 'SAVEPOINT __actual_sp';
    after = 'RELEASE __actual_sp';
    undo = 'ROLLBACK TO __actual_sp';
  } else {
    before = immediate ? 'BEGIN IMMEDIATE' : 'BEGIN';
    after = 'COMMIT';
    undo = 'ROLLBACK';
  }

  execQuery(db, before);
  transactionDepth++;

  try {
    fn();
    execQuery(db, after);
  } catch (ex) {
    execQuery(db, undo);

    if (undo !== 'ROLLBACK') {
      execQuery(db, after);
    }

    throw ex;
  } finally {
    transactionDepth--;
  }
}

// Opens a transaction that stays open until `commitTransaction`, across
// any number of handler calls. Only for bulk imports (the API's
// batch-budget-start/end): any statement that runs in between is caught
// up in it, and nested `transaction` calls become savepoints.
export function beginTransaction(db: Database) {
  if (transactionDepth === 0) {
    db.exec('BEGIN TRANSACTION');
  }
  transactionDepth++;
}

// Always commits: rolling back would also discard the statements other
// handlers ran in between
export function commitTransaction(db: Database) {
  transactionDepth--;
  if (transactionDepth === 0) {
    db.exec('COMMIT');
  }
}

function regexp(regex: string, text: string | null) {
  return new RegExp(regex).test(text || '') ? 1 : 0;
}

// Files opened from a buffer, by their database
const bufferFiles = new WeakMap<Database, string>();
let buffers = 0;

// Opens a database in memory. A path under a persisted directory loads
// the stored file and persists every commit from then on (see
// `#platform/server/persistence`).
export async function openDatabase(pathOrBuffer?: string | Uint8Array) {
  const { oo1 } = getSqlite3();
  let db: Database;
  if (pathOrBuffer == null || pathOrBuffer === ':memory:') {
    db = new oo1.DB(':memory:');
  } else if (typeof pathOrBuffer !== 'string') {
    const name = `/buffer-${buffers++}.sqlite`;
    memoryVfs.addFile(name, pathOrBuffer.slice());
    db = new oo1.DB({ filename: name, vfs: memoryVfs.VFS_NAME });
    bufferFiles.set(db, name);
    db.exec('PRAGMA journal_mode=MEMORY');
  } else if (persistence.isDatabasePath(pathOrBuffer)) {
    const path = pathOrBuffer;
    const bytes = await persistence.loadDatabase(path);
    const onCommit = persistence.attach(path, () => memoryVfs.readFile(path));
    memoryVfs.addFile(path, bytes, onCommit);
    try {
      db = new oo1.DB({ filename: path, vfs: memoryVfs.VFS_NAME });
    } catch (e) {
      persistence.detach(path);
      memoryVfs.removeFile(path);
      throw e;
    }
    // The rollback journal doesn't need to be a file
    db.exec('PRAGMA journal_mode=MEMORY');
  } else {
    throw new Error(
      'Only persisted databases can be opened by path on the web: ' +
        pathOrBuffer,
    );
  }

  // Accept double-quoted string literals, as sql.js did; existing
  // queries may rely on them
  const { capi } = getSqlite3();
  capi.sqlite3_db_config(db, capi.SQLITE_DBCONFIG_DQS_DML, 1, 0);
  capi.sqlite3_db_config(db, capi.SQLITE_DBCONFIG_DQS_DDL, 1, 0);

  // SQLite's own LOWER, UPPER and LIKE only handle ASCII, since this
  // build has no ICU
  const functions: Array<[string, (...args: never[]) => SqlValue | boolean]> = [
    ['UNICODE_LOWER', (arg: string | null) => arg?.toLowerCase() ?? null],
    ['UNICODE_UPPER', (arg: string | null) => arg?.toUpperCase() ?? null],
    ['UNICODE_LIKE', unicodeLike],
    ['REGEXP', regexp],
    ['NORMALISE', normalise],
  ];
  for (const [name, fn] of functions) {
    db.createFunction(name, (_ctx, ...args) => fn(...(args as never[])), {
      arity: fn.length,
      deterministic: true,
    });
  }
  return db;
}

export function closeDatabase(db: Database) {
  const path = db.filename;
  const bufferFile = bufferFiles.get(db);
  db.close();
  if (bufferFile) {
    memoryVfs.removeFile(bufferFile);
  } else if (persistence.isDatabasePath(path)) {
    persistence.detach(path);
    memoryVfs.removeFile(path);
    // A transaction left open across handler calls (the API's batch
    // import) dies with the database
    transactionDepth = 0;
  }
}

export async function exportDatabase(db: Database) {
  return getSqlite3().capi.sqlite3_js_db_export(db);
}
