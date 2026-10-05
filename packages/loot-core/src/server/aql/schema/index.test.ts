// @ts-strict-ignore
import * as db from '#server/db';

import { schema, schemaConfig } from './index';

// This file doesn't test the schema code directly, it tests that
// views return data as expected and various constraints on the
// sqlite3 schema itself.

beforeEach(global.emptyDatabase());

describe('schema', () => {
  test('never returns transactions without a date', async () => {
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(0);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
    db.runQuery('INSERT INTO transactions (acct) VALUES (?)', ['foo']);
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(1);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
  });

  test('never returns transactions without an account', async () => {
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(0);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
    db.runQuery('INSERT INTO transactions (date) VALUES (?)', [20200101]);
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(1);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
  });

  test('never returns child transactions without a parent', async () => {
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(0);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
    db.runQuery(
      'INSERT INTO transactions (date, acct, isChild) VALUES (?, ?, ?)',
      [20200101, 'foo', 1],
    );
    expect(
      (await db.all<db.DbTransaction>('SELECT * FROM transactions')).length,
    ).toBe(1);
    expect(
      (await db.all<db.DbViewTransaction>('SELECT * FROM v_transactions'))
        .length,
    ).toBe(0);
  });
});

describe('viewDependencies', () => {
  // The tables SQLite's plan for `sql` opens, directly or through an index
  function tablesRead(sql: string): string[] {
    const plan = db.runQuery<{ opcode: string; p2: number; p3: number }>(
      'EXPLAIN ' + sql,
      [],
      true,
    );
    // P2 is the b-tree's root page and P3 the database, where 0 is `main`
    const rootPages = plan
      .filter(op => op.opcode === 'OpenRead' && op.p3 === 0)
      .map(op => op.p2);
    return db
      .runQuery<{ tbl_name: string }>(
        `SELECT DISTINCT tbl_name FROM sqlite_master
         WHERE rootpage IN (${rootPages.join(', ')})`,
        [],
        true,
      )
      .map(row => row.tbl_name);
  }

  // Every view a query on `table` can read, whatever its options
  function viewsFor(table: string): string[] {
    const { tableViews } = schemaConfig;
    if (typeof tableViews !== 'function') {
      throw new Error('Expected `tableViews` to be a function');
    }
    const views = new Set<string>();
    for (const isJoin of [false, true]) {
      for (const withDead of [false, true]) {
        for (const splits of ['inline', 'grouped', 'all', 'none']) {
          views.add(
            tableViews(table, {
              isJoin,
              withDead,
              tableOptions: { splits },
            }),
          );
        }
      }
    }
    return [...views];
  }

  test.each(Object.keys(schema))(
    'lists every table the %s views read',
    table => {
      const declared = [table, ...(schemaConfig.viewDependencies[table] ?? [])];
      for (const view of viewsFor(table)) {
        expect(declared).toEqual(
          expect.arrayContaining(tablesRead(`SELECT * FROM ${view}`)),
        );
      }
    },
  );
});
