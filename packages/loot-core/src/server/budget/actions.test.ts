// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extendBudgetMonths, loadBudgetState } from '#server/budget/state';
import * as db from '#server/db';

import {
  coverOverbudgeted,
  getSheetBoolean,
  getSheetValue,
  set3MonthAvg,
  setBudget,
  setCategoryCarryover,
  setNMonthAvg,
} from './actions';

describe('set budget average', () => {
  let originalCurrentMonth: string | null;

  beforeEach(async () => {
    await global.emptyDatabase()();
    originalCurrentMonth = global.currentMonth;
    global.currentMonth = '2024-02';
    await setupAverageDatabase();
  });

  afterEach(async () => {
    global.currentMonth = originalCurrentMonth;
    await global.emptyDatabase()();
  });

  it('sets a single category average from complete months', async () => {
    await setNMonthAvg({ month: '2024-04', N: 3, category: 'cat1' });

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(600);
  });

  it('sets a single category average from the first activity month', async () => {
    setBudget({ category: 'cat1', month: '2023-12', amount: 1000 });

    await setNMonthAvg({ month: '2024-04', N: 3, category: 'cat1' });

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(600);
  });

  it('rounds a single category average to an integer amount', async () => {
    db.insertTransaction({
      date: '2023-12-20',
      amount: -100,
      account: 'account1',
      category: 'cat1',
    });

    await setNMonthAvg({ month: '2024-04', N: 3, category: 'cat1' });

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(633);
  });

  it('sets a bulk 3 month average from complete months', async () => {
    await set3MonthAvg({ month: '2024-04' });

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(600);
  });

  it('sets a bulk 3 month average from the first activity month', async () => {
    setBudget({ category: 'cat1', month: '2023-12', amount: 1000 });

    await set3MonthAvg({ month: '2024-04' });

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(600);
  });
});

describe('setCategoryCarryover', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('sets the flag for only the given month', async () => {
    // Setup: cat2 rolls over January's -20.
    await prepareDatabase();

    expect(await getSheetBoolean('budget202401', 'carryover-cat2')).toBe(true);
    expect(await getSheetBoolean('budget202402', 'carryover-cat2')).toBe(false);
    expect(await getSheetValue('budget202402', 'leftover-cat2')).toBe(-20);
  });

  it('turning the flag off moves the overspending back to "to budget"', async () => {
    await prepareDatabase();
    const toBudgetBefore = await getSheetValue('budget202402', 'to-budget');

    await setCategoryCarryover({
      month: '2024-01',
      category: 'cat2',
      flag: false,
    });

    expect(await getSheetValue('budget202402', 'leftover-cat2')).toBe(0);
    expect(await getSheetValue('budget202402', 'to-budget')).toBe(
      toBudgetBefore - 20,
    );
  });

  it('turning the flag off also clears it in later months', async () => {
    await prepareDatabase();
    for (const month of ['2024-02', '2024-03']) {
      await setCategoryCarryover({ month, category: 'cat2', flag: true });
    }

    await setCategoryCarryover({
      month: '2024-02',
      category: 'cat2',
      flag: false,
    });

    expect(await getSheetBoolean('budget202401', 'carryover-cat2')).toBe(true);
    expect(await getSheetBoolean('budget202402', 'carryover-cat2')).toBe(false);
    expect(await getSheetBoolean('budget202403', 'carryover-cat2')).toBe(false);
  });
});

describe('coverOverbudgeted', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('fully covers the overbudget when category has sufficient leftover', async () => {
    // Setup: cat1 has 100 leftover, overbudget is 90
    await prepareDatabase();

    await coverOverbudgeted({
      month: '2024-02',
      category: 'cat1',
    });

    const sheetName = 'budget202402';
    expect(await getSheetValue(sheetName, 'to-budget')).toBe(0);
    expect(await getSheetValue(sheetName, 'leftover-cat1')).toBe(10);
  });

  it('partially covers the overbudget when category leftover is insufficient', async () => {
    // Setup: cat3 has 10 leftover, overbudget is 90
    await prepareDatabase();

    await coverOverbudgeted({
      month: '2024-02',
      category: 'cat3',
    });

    const sheetName = 'budget202402';
    expect(await getSheetValue(sheetName, 'to-budget')).toBe(-80);
    expect(await getSheetValue(sheetName, 'leftover-cat3')).toBe(0);
  });
});

// Setup: 2024-02, is 90 overbudgeted
// with balances of cat1 = 100, cat2 = -20, cat3 = 10
async function prepareDatabase() {
  db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });
  db.insertCategory({
    id: 'income-cat',
    name: 'Income',
    cat_group: 'income-group',
    is_income: 1,
  });

  db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  db.insertCategory({
    id: 'cat2',
    name: 'cat2',
    cat_group: 'group1',
    is_income: 0,
  });
  db.insertCategory({
    id: 'cat3',
    name: 'cat3',
    cat_group: 'group1',
    is_income: 0,
  });

  setBudget({ category: 'cat1', month: '2024-01', amount: 100 });
  setBudget({ category: 'cat2', month: '2024-01', amount: -20 });
  setBudget({ category: 'cat3', month: '2024-01', amount: 10 });

  await loadBudgetState();
  extendBudgetMonths(['2024-01', '2024-02']);

  await setCategoryCarryover({
    month: '2024-01',
    category: 'cat2',
    flag: true,
  });
}

async function setupAverageDatabase() {
  db.insertAccount({ id: 'account1', name: 'Account 1' });

  db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });
  db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });

  await loadBudgetState();
  extendBudgetMonths([
    '2023-11',
    '2023-12',
    '2024-01',
    '2024-02',
    '2024-03',
    '2024-04',
  ]);

  db.insertTransaction({
    date: '2023-11-15',
    amount: -300,
    account: 'account1',
    category: 'cat1',
  });
  db.insertTransaction({
    date: '2023-12-15',
    amount: -600,
    account: 'account1',
    category: 'cat1',
  });
  db.insertTransaction({
    date: '2024-01-15',
    amount: -900,
    account: 'account1',
    category: 'cat1',
  });
  db.insertTransaction({
    date: '2024-02-15',
    amount: -3000,
    account: 'account1',
    category: 'cat1',
  });
  db.insertTransaction({
    date: '2024-03-15',
    amount: -1200,
    account: 'account1',
    category: 'cat1',
  });
}
