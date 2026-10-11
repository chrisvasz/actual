import { createTestBudget } from '#mocks/budget';
import * as db from '#server/db';
import { handlers } from '#server/main';
import { batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';
import { MAX_SAFE_NUMBER } from '#shared/util';

import * as actions from './actions';
import { createAllBudgets } from './base';
import { forEachBudgetCell, getBudgetCell } from './cells';
import { computeBudget } from './compute';
import { loadBudgetGroups, loadBudgetRows, loadBufferedRows } from './inputs';
import { loadSpending } from './spending';
import {
  flush,
  getBudgetCellValue,
  getBudgetMonths,
  loadBudgetState,
  reloadBudgetState,
  unloadBudgetState,
} from './state';
import { generateBudget } from './test-helpers/generate-budget';
import type { GeneratedBudget } from './test-helpers/generate-budget';
import { createReferenceBudget } from './test-helpers/reference-budget';

beforeEach(global.emptyDatabase());

// The reference (`test-helpers/reference-budget.ts`) transcribes the cell
// formulas of the spreadsheet engine these values used to come from, and was
// checked equal to that engine on all of the budgets and changes below before
// the engine was removed.

function computeFromDb(months: string[]) {
  const rows = { budgets: loadBudgetRows(), buffered: loadBufferedRows() };
  const computed = computeBudget({
    months,
    groups: loadBudgetGroups(),
    spent: loadSpending(),
    ...rows,
  });
  return {
    get: (sheetName: string, name: string) =>
      getBudgetCell(computed, rows, sheetName, name),
    names: () => {
      const names: string[] = [];
      forEachBudgetCell(computed, rows, name => names.push(name));
      return names;
    },
  };
}

function splitName(full: string): [string, string] {
  const idx = full.indexOf('!');
  return [full.slice(0, idx), full.slice(idx + 1)];
}

type Source = { label: string; get: (sheet: string, name: string) => unknown };

// Every name is read from every source; the values must be identical
// (`Object.is`, so 0 and -0 differ too).
function expectSameValues(names: Iterable<string>, sources: Source[]) {
  const mismatches: Array<Record<string, unknown>> = [];
  let count = 0;
  for (const full of new Set(names)) {
    count++;
    const [sheetName, name] = splitName(full);
    const values = sources.map(source => source.get(sheetName, name));
    if (values.some(value => !Object.is(value, values[0]))) {
      mismatches.push({
        cell: full,
        ...Object.fromEntries(sources.map((s, i) => [s.label, values[i]])),
      });
    }
  }
  expect(mismatches.slice(0, 20)).toEqual([]);
  expect(count).toBeGreaterThan(0);
}

const stateSource: Source = { label: 'state', get: getBudgetCellValue };

function budgetMonths(): string[] {
  const months = getBudgetMonths();
  expect(months.length).toBeGreaterThan(0);
  return months;
}

// The budget values as loaded, the reference evaluated from the database, and
// `computeBudget` on freshly read inputs agree on every cell any of them has.
async function expectFreshLoadMatches() {
  unloadBudgetState();
  await loadBudgetState();
  await createAllBudgets();
  const months = budgetMonths();
  const reference = createReferenceBudget(months);
  const computed = computeFromDb(months);
  expectSameValues(
    [...reference.names(), ...computed.names()],
    [
      stateSource,
      { label: 'reference', get: reference.get },
      { label: 'computed', get: computed.get },
    ],
  );
}

describe('computeBudget', () => {
  it.each([1, 2, 3])(
    'matches the reference on a generated budget (seed %i)',
    async seed => {
      await generateBudget({ seed, years: 4 });
      await expectFreshLoadMatches();
    },
  );

  it('matches the reference on the demo budget', async () => {
    await loadBudgetState();
    await createTestBudget(handlers);
    const transactions = db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transactions',
    );
    expect(transactions?.count).toBeGreaterThan(100);
    await expectFreshLoadMatches();
  });

  it('matches the reference on a budget with no transactions', async () => {
    db.insertCategoryGroup({ id: 'group1', name: 'group1' });
    db.insertCategoryGroup({
      id: 'income',
      name: 'income',
      is_income: 1,
    });
    db.insertCategory({ id: 'cat1', name: 'cat1', cat_group: 'group1' });
    await expectFreshLoadMatches();
  });

  it('rounds a non-integer amount instead of blanking the budget', async () => {
    db.insertCategoryGroup({ id: 'group1', name: 'group1' });
    db.insertCategoryGroup({ id: 'income', name: 'income', is_income: 1 });
    db.insertCategory({ id: 'food', name: 'food', cat_group: 'group1' });
    db.insertCategory({ id: 'rent', name: 'rent', cat_group: 'group1' });
    db.insertAccount({ id: 'acct', name: 'acct' });
    const month = monthUtils.currentMonth();
    const dbDate = parseInt(month.replace('-', '')) * 100 + 5;
    for (const [id, category, amount] of [
      ['t1', 'food', -2000],
      ['t2', 'rent', -1.5],
    ] as const) {
      db.runQuery(
        `INSERT INTO transactions (id, acct, category, amount, date, isParent, isChild, tombstone)
         VALUES (?, 'acct', ?, ?, ?, 0, 0, 0)`,
        [id, category, amount, dbDate],
      );
    }

    await loadBudgetState();
    await createAllBudgets();
    const sheetName = monthUtils.sheetForMonth(month);
    expect(getBudgetCellValue(sheetName, 'sum-amount-food')).toBe(-2000);
    expect(getBudgetCellValue(sheetName, 'sum-amount-rent')).toBe(
      Math.round(-1.5),
    );
    expect(getBudgetCellValue(sheetName, 'leftover-food')).toBe(-2000);
    expect(getBudgetCellValue(sheetName, 'to-budget')).toBe(0);
  });

  describe('after changes', () => {
    let budget: GeneratedBudget;
    // What a client that read every cell at load would show, kept current
    // only by the changes the budget notifies.
    let client: Map<string, unknown>;

    beforeEach(async () => {
      budget = await generateBudget({ seed: 7, years: 3 });
      client = new Map();
      await loadBudgetState(changes => {
        for (const { name, value } of changes) {
          client.set(name, value);
        }
      });
      await createAllBudgets();
      const months = budgetMonths();
      for (const full of createReferenceBudget(months).names()) {
        const [sheetName, name] = splitName(full);
        client.set(full, getBudgetCellValue(sheetName, name));
      }
    });

    // The values the budget kept current as changes were applied match the
    // reference and `computeBudget` evaluated from scratch, and so does what
    // the notified client shows in the budget's months.
    async function expectMatches() {
      flush();
      const months = budgetMonths();
      const reference = createReferenceBudget(months);
      const computed = computeFromDb(months);
      const names = [...reference.names(), ...computed.names()];
      expectSameValues(names, [
        stateSource,
        { label: 'reference', get: reference.get },
        { label: 'computed', get: computed.get },
      ]);

      const sheets = new Set(months.map(monthUtils.sheetForMonth));
      expectSameValues(
        names.filter(full => sheets.has(splitName(full)[0])),
        [
          stateSource,
          {
            label: 'client',
            get: (sheetName, name) =>
              client.get(`${sheetName}!${name}`) ?? null,
          },
        ],
      );
    }

    const month = () => monthUtils.subMonths(monthUtils.currentMonth(), 2);
    const date = (m: string, day = 10) =>
      `${m}-${String(day).padStart(2, '0')}`;

    it('stays equal through transaction edits', async () => {
      const [cat1, cat2] = budget.expenseCategories;
      const id = db.insertTransaction({
        account: 'acct-checking',
        category: cat1,
        amount: -5000,
        date: date(month()),
      });
      await expectMatches();

      db.updateTransaction({ id, amount: -7000 });
      await expectMatches();
      db.updateTransaction({
        id,
        date: date(monthUtils.prevMonth(month())),
      });
      await expectMatches();
      db.updateTransaction({ id, category: cat2 });
      await expectMatches();
      db.updateTransaction({ id, account: 'acct-invest' });
      await expectMatches();
      db.updateTransaction({ id, account: 'acct-card' });
      await expectMatches();
      db.updateTransaction({ id, category: null });
      await expectMatches();
      db.updateTransaction({ id, category: 'income-bonus', amount: 900 });
      await expectMatches();
      db.deleteTransaction({ id });
      await expectMatches();
    });

    it('stays equal through split edits', async () => {
      const [cat1, cat2, cat3] = budget.expenseCategories;
      const parentId = 'split-parent';
      batchMessages(() => {
        db.insertTransaction({
          id: parentId,
          account: 'acct-checking',
          amount: -3000,
          date: date(month()),
          is_parent: true,
        });
        db.insertTransaction({
          id: 'split-child-1',
          account: 'acct-checking',
          category: cat1,
          amount: -1000,
          date: date(month()),
          is_child: true,
          parent_id: parentId,
        });
        db.insertTransaction({
          id: 'split-child-2',
          account: 'acct-checking',
          category: cat2,
          amount: -2000,
          date: date(month()),
          is_child: true,
          parent_id: parentId,
        });
      });
      await expectMatches();

      db.updateTransaction({ id: 'split-child-2', category: cat3 });
      await expectMatches();
      db.deleteTransaction({ id: 'split-child-1' });
      await expectMatches();
      batchMessages(() => {
        db.updateTransaction({
          id: parentId,
          date: date(monthUtils.prevMonth(month())),
        });
        db.updateTransaction({
          id: 'split-child-2',
          date: date(monthUtils.prevMonth(month())),
        });
      });
      await expectMatches();
      batchMessages(() => {
        db.deleteTransaction({ id: parentId });
        db.deleteTransaction({ id: 'split-child-2' });
      });
      await expectMatches();
    });

    it('stays equal through budget, carryover and hold changes', async () => {
      const [cat1, cat2] = budget.expenseCategories;
      actions.setBudget({ category: cat1, month: month(), amount: 1234 });
      await expectMatches();
      actions.setBudget({ category: cat2, month: month(), amount: 0 });
      await expectMatches();
      await actions.setCategoryCarryover({
        startMonth: monthUtils.subMonths(month(), 6),
        category: cat1,
        flag: true,
      });
      await expectMatches();
      await actions.setCategoryCarryover({
        startMonth: month(),
        category: cat1,
        flag: false,
      });
      await expectMatches();
      await actions.holdForNextMonth({ month: month(), amount: 5000 });
      await expectMatches();
      await actions.resetHold({ month: month() });
      await expectMatches();
      await actions.setCategoryCarryover({
        startMonth: month(),
        category: 'income-bonus',
        flag: true,
      });
      await expectMatches();
      await actions.resetIncomeCarryover({ month: month() });
      await expectMatches();
      await actions.copyPreviousMonth({ month: month() });
      await expectMatches();
    });

    it('stays equal through account changes', async () => {
      db.updateAccount({ id: 'acct-card', offbudget: 1 });
      await expectMatches();
      db.updateAccount({ id: 'acct-invest', offbudget: 0 });
      await expectMatches();
    });

    it('stays equal through category changes', async () => {
      const [cat1, cat2] = budget.expenseCategories;

      // Merge one category into another
      db.deleteCategory({ id: cat1 }, cat2);
      await expectMatches();

      // Delete one without moving its transactions
      db.deleteCategory({ id: budget.expenseCategories[5] });
      await expectMatches();

      // Move one to another group
      db.moveCategory(budget.expenseCategories[6], 'group-3', null);
      await expectMatches();

      // Add a category and a group
      const groupId = db.insertCategoryGroup({ name: 'new group' });
      await expectMatches();
      const catId = db.insertCategory({
        name: 'new category',
        cat_group: groupId,
      });
      await expectMatches();
      db.insertTransaction({
        account: 'acct-checking',
        category: catId,
        amount: -4200,
        date: date(month()),
      });
      actions.setBudget({ category: catId, month: month(), amount: 300 });
      await expectMatches();

      // Delete a whole group
      db.deleteCategoryGroup({ id: 'group-2' });
      await expectMatches();
    });

    it('stays equal when the budget grows to earlier months', async () => {
      const earliest = db.first<{ date: number }>(
        'SELECT MIN(date) AS date FROM transactions WHERE isChild = 0',
      );
      const earlier = monthUtils.subMonths(
        monthUtils.monthFromDate(db.fromDateRepr(earliest?.date ?? 0)),
        8,
      );
      db.insertTransaction({
        account: 'acct-checking',
        category: budget.expenseCategories[0],
        amount: -100,
        date: date(earlier),
      });
      await createAllBudgets();
      await expectMatches();
    });

    it('stays equal when a parent row that is not marked as one changes', async () => {
      const [cat1, cat2] = budget.expenseCategories;
      // A child that arrives before its parent doesn't count yet
      db.insertTransaction({
        id: 'loose-child',
        account: 'acct-checking',
        category: cat1,
        amount: -1000,
        date: date(month()),
        is_child: true,
        parent_id: 'plain-parent',
      });
      await expectMatches();
      db.insertTransaction({
        id: 'plain-parent',
        account: 'acct-checking',
        category: cat2,
        amount: -1000,
        date: date(month()),
      });
      await expectMatches();
      db.deleteTransaction({ id: 'plain-parent' });
      await expectMatches();
    });

    it('stays equal after reading everything again', async () => {
      // Written without going through sync, then read again
      const dbMonth = parseInt(month().replace('-', ''));
      db.runQuery(
        `INSERT OR REPLACE INTO zero_budgets (id, month, category, amount, carryover)
         VALUES (?, ?, 'income-bonus', 7, 1)`,
        [`${dbMonth}-income-bonus`, dbMonth],
      );
      db.runQuery(
        'UPDATE zero_budgets SET amount = amount + 500 WHERE month = ?',
        [dbMonth],
      );
      reloadBudgetState();
      await expectMatches();
    });

    it('catches up after a computation that failed', async () => {
      // Too large to add up safely, so computing the budget fails...
      db.insertTransaction({
        id: 'huge',
        account: 'acct-checking',
        category: budget.expenseCategories[0],
        amount: MAX_SAFE_NUMBER,
        date: date(month()),
      });
      db.insertTransaction({
        id: 'huge-2',
        account: 'acct-checking',
        category: budget.expenseCategories[0],
        amount: MAX_SAFE_NUMBER,
        date: date(month()),
      });
      flush();
      // ...while stored amounts keep changing
      await actions.setCategoryCarryover({
        startMonth: month(),
        category: 'income-bonus',
        flag: true,
      });
      actions.setBudget({
        category: budget.expenseCategories[1],
        month: month(),
        amount: 4321,
      });
      flush();

      db.deleteTransaction({ id: 'huge' });
      db.deleteTransaction({ id: 'huge-2' });
      await expectMatches();
    });
  });
});
