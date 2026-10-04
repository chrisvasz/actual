// @ts-strict-ignore
import { Timestamp } from '@actual-app/crdt';

import { generateTransaction } from '#mocks';
import { q } from '#shared/query';

import * as db from './db';
import * as sheet from './sheet';
import { applyMessages } from './sync';
import { undo, withUndo } from './undo';

beforeEach(global.emptyDatabase());

async function insertTransactions() {
  await db.insertCategoryGroup({ id: 'group1', name: 'group1' });
  await db.insertCategory({ id: 'cat1', name: 'cat1', cat_group: 'group1' });
  await db.insertCategory({ id: 'cat2', name: 'cat2', cat_group: 'group1' });

  await db.insertTransaction(
    generateTransaction({
      id: 'trans1',
      amount: -3200,
      account: '1',
      category: 'cat1',
      date: '2017-01-08',
    })[0],
  );
  await db.insertTransaction(
    generateTransaction({
      id: 'trans2',
      amount: -2800,
      account: '1',
      category: 'cat2',
      date: '2017-01-10',
    })[0],
  );
  await db.insertTransaction(
    generateTransaction({
      id: 'trans3',
      amount: -9832,
      account: '1',
      category: 'cat2',
      date: '2017-01-15',
    })[0],
  );
}

describe('Spreadsheet', () => {
  test('loading clears a cache left by an older version', async () => {
    db.runQuery(
      `INSERT INTO kvcache (key, value) VALUES ('budget201701!to-budget', '5')`,
    );
    db.runQuery('INSERT INTO kvcache_key (id, key) VALUES (1, 42)');

    await sheet.loadSpreadsheet(db);

    expect(await db.all('SELECT * FROM kvcache')).toEqual([]);
    expect(await db.all('SELECT * FROM kvcache_key')).toEqual([]);
  });

  test('transferring a category triggers an update', async () => {
    const spreadsheet = await sheet.loadSpreadsheet(db);
    await insertTransactions();

    spreadsheet.startTransaction();
    spreadsheet.set(
      'g!foo',
      `=from transactions where category = "cat2" calculate { sum(amount) }`,
    );
    spreadsheet.endTransaction();

    await new Promise(resolve => {
      spreadsheet.onFinish(() => {
        expect(spreadsheet.getValue('g!foo')).toMatchSnapshot();
        resolve(undefined);
      });
    });

    await db.deleteCategory({ id: 'cat1' }, 'cat2');

    return new Promise(resolve => {
      spreadsheet.onFinish(() => {
        expect(spreadsheet.getValue('g!foo')).toMatchSnapshot();
        resolve(undefined);
      });
    });
  });

  test('updating still works after transferring categories', async () => {
    const spreadsheet = await sheet.loadSpreadsheet(db);
    await insertTransactions();

    await db.deleteCategory({ id: 'cat1' }, 'cat2');

    spreadsheet.startTransaction();
    spreadsheet.set(
      'g!foo',
      `=from transactions where category = "cat2" calculate { sum(amount) }`,
    );
    spreadsheet.endTransaction();

    await new Promise(resolve => {
      spreadsheet.onFinish(() => {
        expect(spreadsheet.getValue('g!foo')).toMatchSnapshot();
        resolve(undefined);
      });
    });

    await db.updateTransaction({ id: 'trans1', amount: 50000 });

    await new Promise(resolve => {
      spreadsheet.onFinish(() => {
        expect(spreadsheet.getValue('g!foo')).toMatchSnapshot();
        resolve(undefined);
      });
    });
  });
});

describe('Query cells', () => {
  // Every bind from the client arrives as a fresh copy of the query, the way
  // it would after crossing `postMessage`
  function bindBalance(spreadsheet, filter: Record<string, unknown>) {
    const query = q('transactions')
      .filter(filter)
      .calculate({ $sum: '$amount' })
      .serialize();
    spreadsheet.createQuery('account', 'balance', structuredClone(query));
  }

  function recordChanges(spreadsheet) {
    const changed: string[] = [];
    spreadsheet.addEventListener('change', ({ names }) => {
      changed.push(...names);
    });
    return changed;
  }

  beforeEach(async () => {
    await db.insertAccount({ id: '1', name: 'checking', offbudget: 0 });
  });

  test('binding the same query again does not recompute it', async () => {
    const spreadsheet = await sheet.loadSpreadsheet(db);
    await insertTransactions();
    const changed = recordChanges(spreadsheet);

    bindBalance(spreadsheet, { account: '1' });
    await sheet.waitOnSpreadsheet();
    expect(changed).toEqual(['account!balance']);
    expect(spreadsheet.getValue('account!balance')).toBe(-15832);

    bindBalance(spreadsheet, { account: '1' });
    await sheet.waitOnSpreadsheet();
    expect(changed).toEqual(['account!balance']);
    expect(spreadsheet.getValue('account!balance')).toBe(-15832);
  });

  test('binding a different query recomputes it', async () => {
    const spreadsheet = await sheet.loadSpreadsheet(db);
    await insertTransactions();

    bindBalance(spreadsheet, { account: '1' });
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getValue('account!balance')).toBe(-15832);

    bindBalance(spreadsheet, { category: 'cat2' });
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getValue('account!balance')).toBe(-12632);
  });

  test('the first bind after loading a sheet computes the query', async () => {
    await sheet.loadSpreadsheet(db);
    await insertTransactions();

    bindBalance(sheet.get(), { account: '1' });
    await sheet.waitOnSpreadsheet();

    // Reloading (as opening or switching budgets does) starts from a new sheet
    await db.updateTransaction({ id: 'trans1', amount: -1000 });
    const reloaded = await sheet.reloadSpreadsheet(db);
    expect(reloaded.getValue('account!balance')).toBe(null);

    bindBalance(reloaded, { account: '1' });
    await sheet.waitOnSpreadsheet();
    expect(reloaded.getValue('account!balance')).toBe(-13632);
  });

  test('a re-bound query stays current through edits, undo and sync', async () => {
    const spreadsheet = await sheet.loadSpreadsheet(db);
    await insertTransactions();

    // Each step changes data while nothing is bound, then binds again like a
    // page that was closed and reopened
    async function rebindAndRead() {
      bindBalance(spreadsheet, { account: '1' });
      await sheet.waitOnSpreadsheet();
      return spreadsheet.getValue('account!balance');
    }

    expect(await rebindAndRead()).toBe(-15832);

    await db.insertTransaction(
      generateTransaction({
        id: 'trans4',
        amount: -1000,
        account: '1',
        date: '2017-01-20',
      })[0],
    );
    expect(await rebindAndRead()).toBe(-16832);

    await withUndo(() => db.updateTransaction({ id: 'trans4', amount: -5000 }));
    expect(await rebindAndRead()).toBe(-20832);

    await undo();
    expect(await rebindAndRead()).toBe(-16832);

    await db.deleteTransaction({ id: 'trans4' });
    expect(await rebindAndRead()).toBe(-15832);

    // A change that arrives from another device
    await applyMessages([
      {
        dataset: 'transactions',
        row: 'trans1',
        column: 'amount',
        value: -200,
        timestamp: Timestamp.send(),
      },
    ]);
    expect(await rebindAndRead()).toBe(-12832);
  });
});
