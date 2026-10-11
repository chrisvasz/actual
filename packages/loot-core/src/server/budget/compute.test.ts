import { createTestBudget } from '#mocks/budget';
import * as db from '#server/db';
import { handlers } from '#server/main';
import * as sheet from '#server/sheet';
import { addSyncListener, batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';

import * as actions from './actions';
import { createAllBudgets } from './base';
import { forEachBudgetCell, getBudgetCell } from './cells';
import { computeBudget } from './compute';
import { loadBudgetGroups, loadBudgetRows, loadBufferedRows } from './inputs';
import { getSpendingChanges, loadSpending, refreshSpending } from './spending';
import type { Spending } from './spending';
import { generateBudget } from './test-helpers/generate-budget';
import type { GeneratedBudget } from './test-helpers/generate-budget';
import { createReferenceBudget } from './test-helpers/reference-budget';

beforeEach(global.emptyDatabase());

function createdMonths(): string[] {
  const months = [...sheet.get().meta().createdMonths].sort();
  // `computeBudget` relies on the months being consecutive.
  expect(months).toEqual(
    monthUtils.rangeInclusive(months[0], months[months.length - 1]),
  );
  return months;
}

function computeFromDb(months: string[], spending = loadSpending()) {
  const rows = { budgets: loadBudgetRows(), buffered: loadBufferedRows() };
  const computed = computeBudget({
    months,
    groups: loadBudgetGroups(),
    spent: spending,
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

function flatten(spending: Spending) {
  return [...spending]
    .flatMap(([month, byCategory]) =>
      [...byCategory].map(([id, amount]) => `${month} ${id} ${amount}`),
    )
    .sort();
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

function spreadsheetSource(): Source {
  return {
    label: 'spreadsheet',
    get: (sheetName, name) => sheet.getCellValue(sheetName, name),
  };
}

// The budget cells the spreadsheet has right now, leaving out client-bound
// query cells.
function spreadsheetBudgetCells(): string[] {
  return [...sheet.get().getNodes().values()]
    .filter(node => node.name.startsWith('budget') && !node.sql)
    .map(node => node.name);
}

async function loadEverything() {
  await sheet.loadSpreadsheet(db);
  await createAllBudgets();
  await sheet.waitOnSpreadsheet();
}

// Fresh from the database: the spreadsheet, the reference transcription of
// its cells, and `computeBudget` agree on every cell any of them has.
async function expectFreshLoadMatches() {
  sheet.unloadSpreadsheet();
  await loadEverything();
  const months = createdMonths();
  const reference = createReferenceBudget(months);
  const computed = computeFromDb(months);
  expectSameValues(
    [...spreadsheetBudgetCells(), ...reference.names(), ...computed.names()],
    [
      spreadsheetSource(),
      { label: 'reference', get: reference.get },
      { label: 'computed', get: computed.get },
    ],
  );
}

describe('computeBudget', () => {
  it.each([1, 2, 3])(
    'matches the spreadsheet on a generated budget (seed %i)',
    async seed => {
      await generateBudget({ seed, years: 4 });
      await expectFreshLoadMatches();
    },
  );

  it('matches the spreadsheet on the demo budget', async () => {
    await sheet.loadSpreadsheet(db);
    await createTestBudget(handlers);
    const transactions = db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transactions',
    );
    expect(transactions?.count).toBeGreaterThan(100);
    await expectFreshLoadMatches();
  });

  it('matches the spreadsheet on a budget with no transactions', async () => {
    db.insertCategoryGroup({ id: 'group1', name: 'group1' });
    db.insertCategoryGroup({
      id: 'income',
      name: 'income',
      is_income: 1,
    });
    db.insertCategory({ id: 'cat1', name: 'cat1', cat_group: 'group1' });
    await expectFreshLoadMatches();
  });

  describe('after changes', () => {
    let budget: GeneratedBudget;
    let spending: Spending;
    let removeListener: () => void;

    beforeEach(async () => {
      budget = await generateBudget({ seed: 7, years: 3 });
      await loadEverything();

      // Keep a spending map current the way the budget will: re-read only
      // what each applied change can have touched.
      spending = loadSpending();
      removeListener = addSyncListener((oldData, newData) => {
        const changes = getSpendingChanges(oldData, newData);
        if (changes.reloadAll) {
          spending = loadSpending();
        } else {
          refreshSpending(spending, changes.pairs);
        }
      });
    });

    afterEach(() => removeListener());

    // The reference evaluated from scratch and `computeBudget` on the
    // incrementally kept spending agree, and the kept spending matches a full
    // reload. They also agree with the spreadsheet as it updated itself on
    // every cell the client shows. (The spreadsheet's own in-session updates
    // left a few cells nothing reads different from a fresh load: the empty
    // month before the first one, and budgeted amounts of income categories,
    // which it set to 0 instead of null.)
    async function expectMatches({ spreadsheet = true } = {}) {
      await sheet.waitOnSpreadsheet();
      const months = createdMonths();
      expect(flatten(spending)).toEqual(flatten(loadSpending()));
      const reference = createReferenceBudget(months);
      const computed = computeFromDb(months, spending);
      const names = [...reference.names(), ...computed.names()];
      expectSameValues(names, [
        { label: 'reference', get: reference.get },
        { label: 'computed', get: computed.get },
      ]);

      if (spreadsheet) {
        const sheets = new Set(months.map(monthUtils.sheetForMonth));
        const incomeBudgets = new Set(
          loadBudgetGroups()
            .flatMap(group => group.categories)
            .filter(cat => cat.is_income)
            .map(cat => 'budget-' + cat.id),
        );
        expectSameValues(
          names.filter(full => {
            const [sheetName, name] = splitName(full);
            return sheets.has(sheetName) && !incomeBudgets.has(name);
          }),
          [spreadsheetSource(), { label: 'computed', get: computed.get }],
        );
      }
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
      // The spreadsheet replaced the stored amounts of the month that used to
      // be the empty one before the first with zeros until the next load.
      await expectMatches({ spreadsheet: false });
      removeListener();
      await expectFreshLoadMatches();
    });
  });
});
