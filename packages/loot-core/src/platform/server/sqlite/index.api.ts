// @ts-strict-ignore
import SQL from 'better-sqlite3';

import { logger } from '#platform/server/log';

import { normalise } from './normalise';
import type { SqlParam } from './types';
import { unicodeLike } from './unicodeLike';

export type { SqlParam } from './types';

function verifyParamTypes(sql, arr) {
  arr.forEach(val => {
    if (typeof val !== 'string' && typeof val !== 'number' && val !== null) {
      logger.log(sql, arr);
      throw new Error('Invalid field type ' + val + ' for sql ' + sql);
    }
  });
}

export async function init() {
  // Nothing to initialise for better-sqlite3
}

// Parity with the browser sqlite backend (which instantiates sql.js from an
// embedded wasm binary). better-sqlite3 has no wasm, so this is a no-op; it
// exists so callers can reference `setWasmBinary` regardless of platform.
export function setWasmBinary(_binary: ArrayBuffer | Uint8Array) {
  // no-op on native sqlite
}

export function prepare(db, sql) {
  return db.prepare(sql);
}

export function runQuery(
  db: SQL.Database,
  sql: string | SQL.Statement,
  params: SqlParam[] = [],
  fetchAll = false,
) {
  if (params) {
    verifyParamTypes(sql, params);
  }

  let stmt: SQL.Statement;
  try {
    stmt = typeof sql === 'string' ? db.prepare(sql) : sql;
  } catch (e) {
    logger.log('error', sql);
    throw e;
  }

  if (fetchAll) {
    try {
      const result = stmt.all(...params);
      return result;
    } catch (e) {
      logger.log('error', sql);
      throw e;
    }
  } else {
    const info = stmt.run(...params);
    return { changes: info.changes, insertId: info.lastInsertRowid };
  }
}

export function execQuery(db: SQL.Database, sql: string) {
  db.exec(sql);
}

export type TransactionOptions = {
  // Take the write lock up front (`BEGIN IMMEDIATE`). Only matters on
  // the web backend, but keep the signature the same on every platform.
  immediate?: boolean;
};

export function transaction(
  db: SQL.Database,
  fn: () => void,
  { immediate = false }: TransactionOptions = {},
) {
  const run = db.transaction(fn);
  if (immediate) {
    run.immediate();
  } else {
    run();
  }
}

// Opens a transaction that stays open until `commitTransaction`, across
// any number of handler calls. Only for bulk imports (the API's
// batch-budget-start/end): any statement that runs in between is caught
// up in it, and nested `transaction` calls become savepoints.
let transactionDepth = 0;
export function beginTransaction(db: SQL.Database) {
  if (transactionDepth === 0) {
    db.exec('BEGIN TRANSACTION');
  }
  transactionDepth++;
}

// Always commits: rolling back would also discard the statements other
// handlers ran in between
export function commitTransaction(db: SQL.Database) {
  transactionDepth--;
  if (transactionDepth === 0) {
    db.exec('COMMIT');
  }
}

function regexp(regex: string, text: string | null) {
  return new RegExp(regex).test(text || '') ? 1 : 0;
}

export function openDatabase(pathOrBuffer: string | Buffer): SQL.Database {
  const db = new SQL(pathOrBuffer);
  // Define Unicode-aware LOWER, UPPER, and LIKE implementation.
  // This is necessary because better-sqlite3 uses SQLite build without ICU support.
  db.function('UNICODE_LOWER', { deterministic: true }, (arg: string | null) =>
    arg?.toLowerCase(),
  );
  db.function('UNICODE_UPPER', { deterministic: true }, (arg: string | null) =>
    arg?.toUpperCase(),
  );
  db.function('UNICODE_LIKE', { deterministic: true }, unicodeLike);
  db.function('REGEXP', { deterministic: true }, regexp);
  db.function('NORMALISE', { deterministic: true }, normalise);
  return db;
}

export function closeDatabase(db: SQL.Database) {
  db.close();
}

export async function exportDatabase(db: SQL.Database) {
  return db.serialize();
}
