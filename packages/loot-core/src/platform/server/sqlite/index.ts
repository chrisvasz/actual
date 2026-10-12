// @ts-strict-ignore
import initSqlJS from '@jlongster/sql.js';
import type { Database, SqlJsStatic, Statement } from '@jlongster/sql.js';

import { logger } from '#platform/server/log';
import * as persistence from '#platform/server/persistence';

import { normalise } from './normalise';
import type { SqlParam } from './types';
import { unicodeLike } from './unicodeLike';

export type { SqlParam } from './types';

// Types exported from sql.js (and Emscripten) are incomplete, so we need to redefine them here
type FS = Omit<typeof FS, 'lookupPath'> & {
  lookupPath: (
    path: string,
    opts?: { follow?: boolean },
  ) => { node: (typeof FS)['FSNode'] & { link?: string } };
};
export type SqlJsModule = SqlJsStatic & {
  FS: FS;
  reset_filesystem: () => void;
};

let SQL: SqlJsModule | null = null;

// Opt-in: when set, the wasm is instantiated from these bytes instead of being
// fetched via `locateFile`. The browser build of `@actual-app/api` uses this to
// ship a fully self-contained worker (no `sql-wasm.wasm` request). Dormant for
// every other consumer (web app and Node build never call `setWasmBinary`).
let wasmBinaryOverride: ArrayBuffer | Uint8Array | undefined;

export function setWasmBinary(binary: ArrayBuffer | Uint8Array) {
  wasmBinaryOverride = binary;
}

export async function init({
  baseURL = process.env.PUBLIC_URL,
  wasmBinary = wasmBinaryOverride,
}: { baseURL?: string; wasmBinary?: ArrayBuffer | Uint8Array } = {}) {
  // `initSqlJS` doesn't actually return a real promise, so make sure
  // we're returning a real one for correct semantics
  return new Promise((resolve, reject) => {
    initSqlJS({
      locateFile: file => baseURL + file,
      ...(wasmBinary ? { wasmBinary: wasmBinary as ArrayBuffer } : {}),
    }).then(
      sql => {
        SQL = sql as SqlJsModule;
        resolve(undefined);
      },
      err => {
        reject(err);
      },
    );
  });
}

export function _getModule() {
  if (SQL == null) {
    throw new Error('_getModule: sql.js must be initialized first');
  }
  return SQL;
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
  params?: SqlParam[],
  fetchAll?: false,
): { changes: unknown };
export function runQuery<T>(
  db: Database,
  sql: string | Statement,
  params: SqlParam[],
  fetchAll: true,
): T[];
export function runQuery<T>(
  db: Database,
  sql: string | Statement,
  params: SqlParam[] = [],
  fetchAll = false,
): T[] | { changes: unknown } {
  if (params) {
    verifyParamTypes(sql, params);
  }

  const stmt = typeof sql === 'string' ? db.prepare(sql) : sql;

  if (fetchAll) {
    try {
      stmt.bind(params);
      const rows = [];

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }

      if (typeof sql === 'string') {
        stmt.free();
      } else {
        stmt.reset();
      }
      return rows;
    } catch (e) {
      logger.log(sql);
      throw e;
    }
  } else {
    stmt.run(params);
    return { changes: db.getRowsModified() };
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

function regexp(regex: string, text: string) {
  return new RegExp(regex).test(text || '') ? 1 : 0;
}

// Opens a database in memory. A path under a persisted directory loads
// the stored snapshot of that file and persists the database from then
// on (see `#platform/server/persistence`); any other path is opened in
// place on the in-memory filesystem.
export async function openDatabase(pathOrBuffer?: string | Uint8Array) {
  let db: Database;
  if (pathOrBuffer == null || pathOrBuffer === ':memory:') {
    db = new SQL.Database();
  } else if (typeof pathOrBuffer !== 'string') {
    db = new SQL.Database(pathOrBuffer);
  } else if (persistence.isDatabasePath(pathOrBuffer)) {
    const loaded = await persistence.loadDatabase(pathOrBuffer);
    db = new SQL.Database(loaded.bytes);
    // sql.js keeps the database in a file on its in-memory filesystem;
    // the rollback journal doesn't need to be another file there
    db.exec('PRAGMA journal_mode=MEMORY');
    const filename = '/' + (db as Database & { filename: string }).filename;
    loaded.attach({
      handle: db,
      getBytes: () => SQL.FS.readFile(filename, { encoding: 'binary' }),
      inTransaction,
    });
  } else {
    db = new SQL.Database(
      pathOrBuffer,
      // @ts-expect-error 2nd argument missed in sql.js types
      { filename: true },
    );
  }

  // Define Unicode-aware LOWER, UPPER, and LIKE implementation.
  // This is necessary because sql.js uses SQLite build without ICU support.
  //
  // Note that this function should ideally be created with a deterministic flag
  // to allow SQLite to better optimize calls to it by factoring them out of inner loops
  // but SQL.js does not support this: https://github.com/sql-js/sql.js/issues/551
  db.create_function('UNICODE_LOWER', arg => arg?.toLowerCase());
  db.create_function('UNICODE_UPPER', arg => arg?.toUpperCase());
  db.create_function('UNICODE_LIKE', unicodeLike);
  db.create_function('REGEXP', regexp);
  db.create_function('NORMALISE', normalise);
  return db;
}

export function closeDatabase(db: Database) {
  persistence.detach(db);
  db.close();
}

export async function exportDatabase(db: Database) {
  return db.export();
}
