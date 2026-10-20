// @ts-strict-ignore
import { deserializeClock, getClock } from '@actual-app/crdt';
import { v4 as uuidv4 } from 'uuid';

import { expectSnapshotWithDiffer } from '#mocks/util';
import * as connection from '#platform/server/connection';
import * as fs from '#platform/server/fs';
import {
  extendBudgetMonths,
  flush,
  getBudgetCellValue,
  getBudgetMonths,
  loadBudgetState,
} from '#server/budget/state';
import * as monthUtils from '#shared/months';

import * as budgetActions from './budget/actions';
import * as budget from './budget/base';
import * as db from './db';
import { liveReads, notifyCellChanges } from './live-reads';
import { handlers } from './main';
import {
  disableGlobalMutations,
  enableGlobalMutations,
  runHandler,
  runMutator,
} from './mutators';
import * as prefs from './prefs';

vi.mock('./post');

beforeEach(async () => {
  await global.emptyDatabase()();
  disableGlobalMutations();
});

afterEach(async () => {
  await runHandler(handlers['close-budget']);
  connection.resetEvents();
  enableGlobalMutations();
  global.currentMonth = null;
});

async function createTestBudget(name, id = 'test-budget') {
  const templatePath = fs.join(__dirname, '/../mocks/files', name);
  const budgetPath = fs.join(__dirname, '/../mocks/files/budgets', id);
  fs._setDocumentDir(fs.join(budgetPath, '..'));

  await fs.mkdir(budgetPath);
  await fs.copyFile(
    fs.join(templatePath, 'metadata.json'),
    fs.join(budgetPath, 'metadata.json'),
  );
  await fs.copyFile(
    fs.join(templatePath, 'db.sqlite'),
    fs.join(budgetPath, 'db.sqlite'),
  );
}

describe('Budgets', () => {
  afterEach(async () => {
    fs._setDocumentDir(null);
    for (const id of ['test-budget', 'test-budget-2']) {
      const budgetPath = fs.join(__dirname, '/../mocks/files/budgets', id);
      if (await fs.exists(budgetPath)) {
        await fs.removeDirRecursively(budgetPath);
      }
    }
  });

  test('a budget load waits for the one in flight', async () => {
    await createTestBudget('default-budget-template');
    await createTestBudget('default-budget-template', 'test-budget-2');

    // Like opening another budget while the last one is still
    // auto-opening at startup
    const first = runHandler(handlers['load-budget'], { id: 'test-budget' });
    const second = runHandler(handlers['load-budget'], {
      id: 'test-budget-2',
    });

    expect(await first).toEqual({});
    expect(await second).toEqual({});
    expect(prefs.getPrefs().id).toBe('test-budget-2');
    expect(db.getDatabase()).not.toBe(null);
  });

  test('closing a budget waits for the load in flight', async () => {
    await createTestBudget('default-budget-template');

    const load = runHandler(handlers['load-budget'], { id: 'test-budget' });
    const close = runHandler(handlers['close-budget']);

    expect(await load).toEqual({});
    expect(await close).toBe('ok');
    expect(prefs.getPrefs()).toBe(null);
    expect(db.getDatabase()).toBe(null);
  });

  test('budget is successfully loaded', async () => {
    await createTestBudget('default-budget-template');

    // Grab the clock to compare later
    await db.openDatabase('test-budget');
    const row = db.first<db.DbClockMessage>('SELECT * FROM messages_clock');

    const { error } = await runHandler(handlers['load-budget'], {
      id: 'test-budget',
    });
    expect(error).toBe(undefined);

    // Make sure the prefs were loaded
    expect(prefs.getPrefs().id).toBe('test-budget');

    // Make sure the clock has been loaded
    expect(getClock()).toEqual(deserializeClock(row.clock));
  });

  test.each([
    [
      'stale',
      `UPDATE sqlite_stat1 SET stat = '7 1' WHERE tbl = 'transactions'`,
    ],
    ['missing', `DELETE FROM sqlite_stat1 WHERE tbl = 'transactions'`],
  ])('loading a budget refreshes %s planner stats', async (_, breakStats) => {
    await createTestBudget('default-budget-template');
    // The template's old migrations run their own ANALYZE
    await runHandler(handlers['load-budget'], { id: 'test-budget' });

    db.transaction(() => {
      for (let i = 0; i < 300; i++) {
        db.runQuery(
          'INSERT INTO transactions (id, amount, date) VALUES (?, ?, ?)',
          [uuidv4(), i, 20200101],
        );
      }
    });
    db.execQuery('ANALYZE');
    db.execQuery(breakStats);
    const { count } = db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transactions',
    );
    await runHandler(handlers['close-budget']);

    const { error } = await runHandler(handlers['load-budget'], {
      id: 'test-budget',
    });
    expect(error).toBe(undefined);

    const stats = db.runQuery<{ stat: string }>(
      `SELECT stat FROM sqlite_stat1 WHERE tbl = 'transactions'`,
      [],
      true,
    );
    expect(stats.length).toBeGreaterThan(0);
    for (const { stat } of stats) {
      expect(stat.split(' ')[0]).toBe(String(count));
    }
  });

  test('budget detects out of sync migrations', async () => {
    await createTestBudget('default-budget-template');

    await db.openDatabase('test-budget');
    db.runQuery('INSERT INTO __migrations__ (id) VALUES (1000)');

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => null);

    const { error } = await runHandler(handlers['load-budget'], {
      id: 'test-budget',
    });
    // There should be an error and the budget should be unloaded
    expect(error).toBe('out-of-sync-migrations');
    expect(db.getDatabase()).toBe(null);
    expect(prefs.getPrefs()).toBe(null);

    spy.mockRestore();
  });
});

describe('Accounts', () => {
  test('Transfers are properly updated', async () => {
    await runMutator(async () => {
      db.insertAccount({ id: 'one', name: 'one' });
      db.insertAccount({ id: 'two', name: 'two' });
      db.insertAccount({ id: 'three', name: 'three' });
      db.insertPayee({
        id: 'transfer-one',
        name: '',
        transfer_acct: 'one',
      });
      db.insertPayee({
        id: 'transfer-two',
        name: '',
        transfer_acct: 'two',
      });
      db.insertPayee({
        id: 'transfer-three',
        name: '',
        transfer_acct: 'three',
      });
    });

    const id = 'test-transfer';
    await runHandler(handlers['transaction-add'], {
      id,
      account: 'one',
      amount: 5000,
      payee: 'transfer-two',
      date: '2017-01-01',
    });
    const differ = expectSnapshotWithDiffer(
      db.all<db.DbTransaction>('SELECT * FROM transactions'),
    );

    await runHandler(handlers['transaction-update'], {
      ...db.getTransaction(id),
      payee: 'transfer-three',
      date: '2017-01-03',
    });
    differ.expectToMatchDiff(
      db.all<db.DbTransaction>('SELECT * FROM transactions'),
    );

    const transaction = db.getTransaction(id);
    await runHandler(handlers['transaction-delete'], transaction);
    differ.expectToMatchDiff(
      db.all<db.DbTransaction>('SELECT * FROM transactions'),
    );
  });
});

describe('Budget', () => {
  test('new budgets should be created', async () => {
    await loadBudgetState();

    await runMutator(async () => {
      db.insertCategoryGroup({
        id: 'incomeGroup',
        name: 'incomeGroup',
        is_income: 1,
      });
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      db.insertCategory({ name: 'foo', cat_group: 'group1' });
      db.insertCategory({ name: 'bar', cat_group: 'group1' });
    });

    let bounds = await runHandler(handlers['get-budget-bounds']);
    expect(bounds.start).toBe('2016-10');
    expect(bounds.end).toBe('2018-01');
    expect(getBudgetMonths()).toEqual(
      monthUtils.rangeInclusive('2016-10', '2018-01'),
    );

    // Add a transaction (which needs an account) earlier then the
    // current earliest budget to test if it creates the necessary
    // budgets for the earlier months
    db.runQuery("INSERT INTO accounts (id, name) VALUES ('one', 'boa')");
    await runHandler(handlers['transaction-add'], {
      id: uuidv4(),
      date: '2016-05-06',
      amount: 50,
      account: 'one',
    });

    // Fast-forward in time to a future month and make sure it creates
    // budgets for the months in the future
    global.currentMonth = '2017-02';

    bounds = await runHandler(handlers['get-budget-bounds']);
    expect(bounds.start).toBe('2016-02');
    expect(bounds.end).toBe('2018-02');
    expect(getBudgetMonths()).toEqual(
      monthUtils.rangeInclusive('2016-02', '2018-02'),
    );
  });

  test('budget updates when changing a category', async () => {
    let notified: string[] = [];
    onTestFinished(
      liveReads.onChanges(changes => {
        if (changes !== 'all') {
          notified = notified.concat(changes.cells);
        }
      }),
    );
    await loadBudgetState(notifyCellChanges);
    async function captureChangedCells(func: () => Promise<unknown>) {
      notified = [];
      await func();
      flush();
      return notified;
    }

    // Only the cells whose values changed are reported
    extendBudgetMonths(monthUtils.rangeInclusive('2017-01', '2017-04'));

    let categories;
    await captureChangedCells(async () => {
      await runMutator(async () =>
        db.insertCategoryGroup({ id: 'group1', name: 'group1' }),
      );
      categories = [
        await runHandler(handlers['category-create'], {
          name: 'foo',
          groupId: 'group1',
        }),
        await runHandler(handlers['category-create'], {
          name: 'bar',
          groupId: 'group1',
        }),
        await runHandler(handlers['category-create'], {
          name: 'baz',
          groupId: 'group1',
        }),
        await runHandler(handlers['category-create'], {
          name: 'biz',
          groupId: 'group1',
        }),
      ];
    });

    db.runQuery("INSERT INTO accounts (id, name) VALUES ('boa', 'boa')");
    const trans = {
      id: 'boa-transaction',
      date: '2017-02-06',
      amount: 5000,
      account: 'boa',
      category: categories[0],
    };
    // Test insertions
    let changed = await captureChangedCells(() =>
      runHandler(handlers['transaction-add'], trans),
    );
    expect(
      changed.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)),
    ).toMatchSnapshot();
    // Test updates
    changed = await captureChangedCells(async () => {
      await runHandler(handlers['transaction-update'], {
        ...db.getTransaction(trans.id),
        amount: 7000,
      });
    });
    expect(
      changed.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)),
    ).toMatchSnapshot();
    // Test deletions
    changed = await captureChangedCells(async () => {
      await runHandler(handlers['transaction-delete'], { id: trans.id });
    });
    expect(
      changed.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)),
    ).toMatchSnapshot();
  });
});

describe('Categories', () => {
  test('can be deleted', async () => {
    await loadBudgetState();

    await runMutator(async () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      db.insertCategory({ id: 'foo', name: 'foo', cat_group: 'group1' });
      db.insertCategory({ id: 'bar', name: 'bar', cat_group: 'group1' });
    });

    let categories = db.getCategories();
    expect(categories.length).toBe(2);
    expect(categories.find(cat => cat.name === 'foo')).not.toBeNull();
    expect(categories.find(cat => cat.name === 'bar')).not.toBeNull();
    await runHandler(handlers['category-delete'], { id: 'foo' });

    categories = db.getCategories();
    expect(categories.length).toBe(1);
    expect(categories.find(cat => cat.name === 'bar')).not.toBeNull();
  });

  test('transfers properly when deleted', async () => {
    await loadBudgetState();

    const transId = await runMutator(async () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      db.insertCategoryGroup({ id: 'group1b', name: 'group1b' });
      db.insertCategoryGroup({
        id: 'group2',
        name: 'group2',
        is_income: 1,
      });
      db.insertCategory({ id: 'foo', name: 'foo', cat_group: 'group1' });
      db.insertCategory({ id: 'bar', name: 'bar', cat_group: 'group1b' });
      db.insertCategory({
        id: 'income1',
        name: 'income1',
        is_income: 1,
        cat_group: 'group2',
      });
      db.insertCategory({
        id: 'income2',
        name: 'income2',
        is_income: 1,
        cat_group: 'group2',
      });

      return db.insertTransaction({
        date: '2017-01-01',
        account: 'acct',
        amount: 4500,
        category: 'foo',
      });
    });

    await budget.createAllBudgets();

    // Set a budget value for the category `foo` of 1000
    const sheetName = monthUtils.sheetForMonth('2018-01');
    budgetActions.setBudget({
      category: 'foo',
      month: '2018-01',
      amount: 1000,
    });
    expect(getBudgetCellValue(sheetName, 'group-budget-group1')).toBe(1000);
    expect(getBudgetCellValue(sheetName, 'group-budget-group1b')).toBe(0);

    // Make sure the transaction has a category of `foo`
    let trans = db.getTransaction(transId);
    expect(trans.category).toBe('foo');

    await runHandler(handlers['category-delete'], {
      id: 'foo',
      transferId: 'bar',
    });

    // Make sure the transaction has been updated
    trans = db.getTransaction(transId);
    expect(trans.category).toBe('bar');

    // Make sure the budget value was transferred
    expect(getBudgetCellValue(sheetName, 'group-budget-group1')).toBe(0);
    expect(getBudgetCellValue(sheetName, 'group-budget-group1b')).toBe(1000);

    // Transfering an income category to an expense just doesn't make
    // sense. Make sure this doesn't do anything.
    await expect(
      runHandler(handlers['category-delete'], {
        id: 'income1',
        transferId: 'bar',
      }),
    ).rejects.toThrow('Cannot transfer between income and expense categories.');

    let categories = db.getCategories();
    expect(categories.find(cat => cat.id === 'income1')).toBeDefined();

    // Make sure you can delete income categories
    await runHandler(handlers['category-delete'], {
      id: 'income1',
      transferId: 'income2',
    });

    categories = db.getCategories();
    expect(categories.find(cat => cat.id === 'income1')).not.toBeDefined();
  });

  test('do not count as overspent when deleted', async () => {
    await loadBudgetState();

    await runMutator(async () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      db.insertCategoryGroup({
        id: 'group2',
        name: 'income',
        is_income: 1,
      });
      db.insertCategory({ id: 'foo', name: 'foo', cat_group: 'group1' });
      db.insertCategory({ id: 'bar', name: 'bar', cat_group: 'group1' });
      db.insertAccount({ id: 'acct', name: 'acct' });

      // A deposit straight into the category, like a refund
      db.insertTransaction({
        date: '2017-01-01',
        account: 'acct',
        amount: 10000,
        category: 'foo',
      });
    });

    await budget.createAllBudgets();

    // Move 1000 from `foo` to `bar`, which leaves `foo` with a negative
    // budgeted amount
    budgetActions.setBudget({
      category: 'foo',
      month: '2017-01',
      amount: -1000,
    });
    budgetActions.setBudget({
      category: 'bar',
      month: '2017-01',
      amount: 1000,
    });

    const nextSheetName = monthUtils.sheetForMonth('2017-02');
    expect(getBudgetCellValue(nextSheetName, 'last-month-overspent')).toBe(0);
    const toBudget = getBudgetCellValue(nextSheetName, 'to-budget');

    await runHandler(handlers['category-delete'], {
      id: 'foo',
      transferId: 'bar',
    });

    // The deleted category should not leave any overspending behind
    expect(getBudgetCellValue(nextSheetName, 'last-month-overspent')).toBe(0);
    expect(getBudgetCellValue(nextSheetName, 'to-budget')).toBe(toBudget);
  });
});
