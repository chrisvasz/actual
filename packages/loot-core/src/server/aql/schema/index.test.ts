// @ts-strict-ignore
import { tablesRead } from '#mocks/tables-read';
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
