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
      return readRows<T>(db, stmt);
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

// The raw C exports `readRows` calls. `wasm.exports` is untyped.
type RawExports = {
  sqlite3_step: (stmt: number) => number;
  sqlite3_column_type: (stmt: number, col: number) => number;
  sqlite3_column_double: (stmt: number, col: number) => number;
  sqlite3_column_text: (stmt: number, col: number) => number;
  sqlite3_column_blob: (stmt: number, col: number) => number;
  sqlite3_column_bytes: (stmt: number, col: number) => number;
};

const textDecoder = new TextDecoder();

// Reads every row of a bound statement, with the values `stmt.get({})`
// returns, through SQLite's C exports. OO1's per-cell wrapper costs about
// 1.6µs a cell, which dominates large reads.
function readRows<T>(db: Database, stmt: Statement): T[] {
  const { capi, wasm, oo1 } = getSqlite3();
  const raw = wasm.exports as RawExports;
  const ptr = stmt.pointer;
  if (ptr === undefined) {
    throw new Error('Statement is finalized');
  }
  const columnCount = capi.sqlite3_column_count(ptr);
  const names: string[] = [];
  for (let i = 0; i < columnCount; i++) {
    names.push(capi.sqlite3_column_name(ptr, i) ?? '');
  }

  const rows: T[] = [];
  let rc: number;
  while ((rc = raw.sqlite3_step(ptr)) === capi.SQLITE_ROW) {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < columnCount; i++) {
      let value: unknown;
      switch (raw.sqlite3_column_type(ptr, i)) {
        case capi.SQLITE_INTEGER:
          // A double holds every integer up to 2^53 exactly, unlike
          // `sqlite3_column_int` (32-bit). Larger ones come back as BigInt,
          // as in OO1.
          value = raw.sqlite3_column_double(ptr, i);
          if (!Number.isSafeInteger(value)) {
            value = readUnsafeInteger(ptr, i);
          }
          break;
        case capi.SQLITE_FLOAT:
          value = raw.sqlite3_column_double(ptr, i);
          break;
        case capi.SQLITE_TEXT: {
          const text = raw.sqlite3_column_text(ptr, i);
          const bytes = raw.sqlite3_column_bytes(ptr, i);
          // The heap is taken after the column calls: if one grows the wasm
          // memory, views taken before it are detached
          value = textDecoder.decode(
            wasm.heap8u().subarray(text, text + bytes),
          );
          break;
        }
        case capi.SQLITE_BLOB: {
          const blob = raw.sqlite3_column_blob(ptr, i);
          const bytes = raw.sqlite3_column_bytes(ptr, i);
          value = bytes
            ? wasm.heap8u().slice(blob, blob + bytes)
            : new Uint8Array(0);
          break;
        }
        default:
          value = null;
      }
      row[names[i]] = value;
    }
    rows.push(row as T);
  }
  if (rc !== capi.SQLITE_DONE) {
    oo1.DB.checkRc(db, rc);
  }
  return rows;
}

function readUnsafeInteger(ptr: number, col: number) {
  const { capi, config } = getSqlite3();
  if (!config.bigIntEnabled) {
    throw new Error(
      'Integer is out of range for JS integer range: ' +
        capi.sqlite3_column_double(ptr, col),
    );
  }
  return capi.sqlite3_column_int64(ptr, col);
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

  // This build leaves double-quoted string literals ("DQS") off, as
  // better-sqlite3 does: `"foo"` is always an identifier, so a mistyped
  // column is an error rather than the string 'foo'. Use single quotes
  // for string literals.

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
