// @ts-strict-ignore

import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';
import { safeNumber } from '#shared/util';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

import { getBudgetCellValue, getBudgetMonths } from './state';

export async function getSheetValue(
  sheetName: string,
  cell: string,
): Promise<number> {
  const value = getBudgetCellValue(sheetName, cell);
  return safeNumber(typeof value === 'number' ? value : 0);
}

export async function getSheetBoolean(
  sheetName: string,
  cell: string,
): Promise<boolean> {
  const value = getBudgetCellValue(sheetName, cell);
  return typeof value === 'boolean' ? value : false;
}

// We want to only allow the positive movement of money back and
// forth. buffered should never be allowed to go into the negative,
// and you shouldn't be allowed to pull non-existent money from
// leftover.
function calcBufferedAmount(
  toBudget: number,
  buffered: number,
  amount: number,
): number {
  amount = Math.min(Math.max(amount, -buffered), Math.max(toBudget, 0));
  return buffered + amount;
}

function dbMonth(month: string): number {
  return parseInt(month.replace('-', ''));
}

function monthFromDbMonth(month: number): string {
  const monthString = String(month).padStart(6, '0');
  return `${monthString.slice(0, 4)}-${monthString.slice(4)}`;
}

// TODO: complete list of fields.
type BudgetData = {
  is_income: 1 | 0;
  hidden: 1 | 0;
  group_hidden: 1 | 0;
  category: string;
  amount: number;
};

function getBudgetData(month: string): BudgetData[] {
  return db.all<
    db.DbZeroBudget &
      Pick<
        db.DbViewCategoryWithGroupHidden,
        'is_income' | 'hidden' | 'group_hidden'
      >
  >(
    `
    SELECT b.*, c.is_income, c.hidden, g.hidden AS group_hidden
    FROM zero_budgets b
    LEFT JOIN categories c ON b.category = c.id
    LEFT JOIN category_groups g ON c.cat_group = g.id
    WHERE c.tombstone = 0 AND b.month = ?
  `,
    [month],
  );
}

function getAllMonths(startMonth: string): string[] {
  const months = getBudgetMonths();
  return monthUtils.rangeInclusive(startMonth, months[months.length - 1]);
}

// TODO: Valid month format in all the functions below

export function getBudget({
  category,
  month,
}: {
  category: string;
  month: string;
}): number {
  const existing = db.first<db.DbZeroBudget>(
    `SELECT * FROM zero_budgets WHERE month = ? AND category = ?`,
    [dbMonth(month), category],
  );
  return existing ? existing.amount || 0 : 0;
}

export function setBudget({
  category,
  month,
  amount,
}: {
  category: CategoryEntity['id'];
  month: string;
  amount: unknown;
}): void {
  amount = safeNumber(typeof amount === 'number' ? amount : 0);

  const existing = db.first<Pick<db.DbZeroBudget, 'id'>>(
    `SELECT id FROM zero_budgets WHERE month = ? AND category = ?`,
    [dbMonth(month), category],
  );
  if (existing) {
    return db.update('zero_budgets', { id: existing.id, amount });
  }
  return db.insert('zero_budgets', {
    id: `${dbMonth(month)}-${category}`,
    month: dbMonth(month),
    category,
    amount,
  });
}

export function setBuffer(month: string, amount: unknown): void {
  const existing = db.first<Pick<db.DbZeroBudget, 'id'>>(
    `SELECT id FROM zero_budget_months WHERE id = ?`,
    [month],
  );
  if (existing) {
    return db.update('zero_budget_months', {
      id: existing.id,
      buffered: amount,
    });
  }
  return db.insert('zero_budget_months', { id: month, buffered: amount });
}

function setCarryover(category: string, month: string, flag: boolean): void {
  const existing = db.first<Pick<db.DbZeroBudget, 'id'>>(
    `SELECT id FROM zero_budgets WHERE month = ? AND category = ?`,
    [month, category],
  );
  if (existing) {
    return db.update('zero_budgets', {
      id: existing.id,
      carryover: flag ? 1 : 0,
    });
  }
  return db.insert('zero_budgets', {
    id: `${month}-${category}`,
    month,
    category,
    carryover: flag ? 1 : 0,
  });
}

// Actions

export async function copyPreviousMonth({
  month,
}: {
  month: string;
}): Promise<void> {
  const prevMonth = dbMonth(monthUtils.prevMonth(month));
  const budgetData = getBudgetData(prevMonth.toString());

  batchMessages(() => {
    budgetData.forEach(prevBudget => {
      if (prevBudget.is_income === 1) {
        return;
      }
      if (prevBudget.hidden === 1 || prevBudget.group_hidden === 1) {
        return;
      }
      setBudget({
        category: prevBudget.category,
        month,
        amount: prevBudget.amount,
      });
    });
  });
}

export async function copySinglePreviousMonth({
  month,
  category,
}: {
  month: string;
  category: string;
}): Promise<void> {
  const prevMonth = monthUtils.prevMonth(month);
  const newAmount = await getSheetValue(
    monthUtils.sheetForMonth(prevMonth),
    'budget-' + category,
  );
  batchMessages(() => {
    setBudget({ category, month, amount: newAmount });
  });
}

export async function setZero({ month }: { month: string }): Promise<void> {
  const categories = db.all<db.DbViewCategory>(
    'SELECT * FROM v_categories WHERE tombstone = 0',
  );

  batchMessages(() => {
    categories.forEach(cat => {
      if (cat.is_income === 1) {
        return;
      }
      setBudget({ category: cat.id, month, amount: 0 });
    });
  });
}

export async function set3MonthAvg({
  month,
}: {
  month: string;
}): Promise<void> {
  const categories = db.all<db.DbViewCategoryWithGroupHidden>(
    `
  SELECT c.*
  FROM categories c
  LEFT JOIN category_groups g ON c.cat_group = g.id
  WHERE c.tombstone = 0 AND c.hidden = 0 AND g.hidden = 0
  `,
  );

  const budgets: Array<{ category: string; amount: number }> = [];
  for (const cat of categories) {
    if (cat.is_income === 1) {
      continue;
    }

    const avg = await getCategoryAverage({
      month,
      maxMonths: 3,
      categoryId: cat.id,
    });

    budgets.push({ category: cat.id, amount: -avg });
  }

  batchMessages(() => {
    for (const { category, amount } of budgets) {
      setBudget({ category, month, amount });
    }
  });
}

export async function set12MonthAvg({
  month,
}: {
  month: string;
}): Promise<void> {
  const categories = db.all<db.DbViewCategoryWithGroupHidden>(
    `
  SELECT c.*
  FROM categories c
  LEFT JOIN category_groups g ON c.cat_group = g.id
  WHERE c.tombstone = 0 AND c.hidden = 0 AND g.hidden = 0
  `,
  );

  const budgets: Array<{ category: string; amount: number }> = [];
  for (const cat of categories) {
    if (cat.is_income === 1) {
      continue;
    }
    budgets.push({
      category: cat.id,
      amount: await getNMonthAvgBudget({ month, N: 12, category: cat.id }),
    });
  }

  batchMessages(() => {
    for (const { category, amount } of budgets) {
      setBudget({ category, month, amount });
    }
  });
}

export async function set6MonthAvg({
  month,
}: {
  month: string;
}): Promise<void> {
  const categories = db.all<db.DbViewCategoryWithGroupHidden>(
    `
  SELECT c.*
  FROM categories c
  LEFT JOIN category_groups g ON c.cat_group = g.id
  WHERE c.tombstone = 0 AND c.hidden = 0 AND g.hidden = 0
  `,
  );

  const budgets: Array<{ category: string; amount: number }> = [];
  for (const cat of categories) {
    if (cat.is_income === 1) {
      continue;
    }
    budgets.push({
      category: cat.id,
      amount: await getNMonthAvgBudget({ month, N: 6, category: cat.id }),
    });
  }

  batchMessages(() => {
    for (const { category, amount } of budgets) {
      setBudget({ category, month, amount });
    }
  });
}

export async function setNMonthAvg({
  month,
  N,
  category,
}: {
  month: string;
  N: number;
  category: string;
}): Promise<void> {
  const amount = await getNMonthAvgBudget({ month, N, category });
  setBudget({ category, month, amount });
}

async function getNMonthAvgBudget({
  month,
  N,
  category,
}: {
  month: string;
  N: number;
  category: string;
}): Promise<number> {
  const categoryFromDb = db.first<Pick<db.DbViewCategory, 'is_income'>>(
    'SELECT is_income FROM v_categories WHERE id = ?',
    [category],
  );

  const avg = await getCategoryAverage({
    month,
    maxMonths: N,
    categoryId: category,
  });

  return categoryFromDb.is_income === 0 ? -avg : avg;
}

export async function getCategoryAverage({
  month,
  maxMonths,
  categoryId,
}: {
  month: string;
  maxMonths: number;
  categoryId: string;
}): Promise<number> {
  const months = getAverageMonths({
    month,
    maxMonths,
    categoryId,
  });
  if (months.length === 0) {
    return 0;
  }

  let sumAmount = 0;
  for (const prevMonth of months) {
    sumAmount += await getSheetValue(
      monthUtils.sheetForMonth(prevMonth),
      'sum-amount-' + categoryId,
    );
  }
  return Math.round(sumAmount / months.length);
}

function getAverageMonths({
  month,
  maxMonths,
  categoryId,
}: {
  month: string;
  maxMonths: number;
  categoryId: string;
}): string[] {
  const firstMonth = getAverageStartMonth(month);
  const firstActivityMonth = getFirstActivityMonth({
    categoryId,
    endMonth: firstMonth,
  });
  const months: string[] = [];
  let prevMonth = firstMonth;

  for (let l = 0; l < maxMonths; l++) {
    if (firstActivityMonth != null && prevMonth < firstActivityMonth) {
      break;
    }

    months.push(prevMonth);
    prevMonth = monthUtils.prevMonth(prevMonth);
  }

  return months;
}

function getAverageStartMonth(month: string): string {
  const prevMonth = monthUtils.prevMonth(month);

  if (prevMonth >= monthUtils.currentMonth()) {
    return monthUtils.prevMonth(monthUtils.currentMonth());
  }

  return prevMonth;
}

function getFirstActivityMonth({
  categoryId,
  endMonth,
}: {
  categoryId: string;
  endMonth: string;
}): string | null {
  const endDbMonth = dbMonth(endMonth);
  const firstActivity = db.first<{ month: number | null }>(
    `SELECT MIN(month) AS month
       FROM (
         SELECT month
           FROM zero_budgets
          WHERE category = ? AND month <= ?
         UNION ALL
         SELECT CAST(t.date / 100 AS INTEGER) AS month
           FROM v_transactions_internal_alive t
           LEFT JOIN accounts a ON a.id = t.account
          WHERE t.category = ?
            AND CAST(t.date / 100 AS INTEGER) <= ?
            AND a.offbudget = 0
       )`,
    [categoryId, endDbMonth, categoryId, endDbMonth],
  );

  return firstActivity?.month == null
    ? null
    : monthFromDbMonth(firstActivity.month);
}

export async function holdForNextMonth({
  month,
  amount,
}: {
  month: string;
  amount: number;
}): Promise<boolean> {
  const row = db.first<Pick<db.DbZeroBudgetMonth, 'buffered'>>(
    'SELECT buffered FROM zero_budget_months WHERE id = ?',
    [month],
  );

  const sheetName = monthUtils.sheetForMonth(month);
  const toBudget = await getSheetValue(sheetName, 'to-budget');

  if (toBudget > 0) {
    const bufferedAmount = calcBufferedAmount(
      toBudget,
      (row && row.buffered) || 0,
      amount,
    );

    setBuffer(month, bufferedAmount);
    return true;
  }
  return false;
}

export async function resetHold({ month }: { month: string }): Promise<void> {
  setBuffer(month, 0);
}

export async function coverOverspending({
  month,
  to,
  from,
  amount,
}: {
  month: string;
  to: CategoryEntity['id'] | 'to-budget';
  from: CategoryEntity['id'] | 'to-budget' | 'overbudgeted';
  amount?: IntegerAmount;
}): Promise<void> {
  const sheetName = monthUtils.sheetForMonth(month);
  const toBudgeted = await getSheetValue(sheetName, 'budget-' + to);
  const leftoverFrom = await getSheetValue(
    sheetName,
    from === 'to-budget' ? 'to-budget' : 'leftover-' + from,
  );

  // Cover provided amount (can be partial) or full overspending amount.
  const amountToCover = amount
    ? // Covering in the app provides a positive amount to cover so we invert it here
      -amount
    : await getSheetValue(sheetName, 'leftover-' + to);

  if (amountToCover >= 0 || leftoverFrom <= 0) {
    return;
  }

  // Don't go over the leftover amount of the covering category
  const coverableAmount = Math.min(Math.abs(amountToCover), leftoverFrom);

  // If we are covering it from the to be budgeted amount, ignore this
  const fromBudgeted =
    from !== 'to-budget'
      ? await getSheetValue(sheetName, 'budget-' + from)
      : null;

  batchMessages(() => {
    if (from !== 'to-budget') {
      setBudget({
        category: from,
        month,
        amount: fromBudgeted - coverableAmount,
      });
    }

    setBudget({
      category: to,
      month,
      amount: toBudgeted + coverableAmount,
    });
  });
}

export async function transferAvailable({
  month,
  amount,
  category,
}: {
  month: string;
  amount: number;
  category: string;
}): Promise<void> {
  const sheetName = monthUtils.sheetForMonth(month);
  const leftover = await getSheetValue(sheetName, 'to-budget');
  amount = Math.max(Math.min(amount, leftover), 0);

  const budgeted = await getSheetValue(sheetName, 'budget-' + category);
  setBudget({ category, month, amount: budgeted + amount });
}

export async function coverOverbudgeted({
  month,
  category,
  amount,
}: {
  month: string;
  category: string;
  amount?: IntegerAmount;
}): Promise<void> {
  const sheetName = monthUtils.sheetForMonth(month);
  const categoryBudget = await getSheetValue(sheetName, 'budget-' + category);
  const categoryLeftover = await getSheetValue(
    sheetName,
    'leftover-' + category,
  );

  // Cover provided amount (can be partial) or full overbudgeted amount.
  const amountToCover = amount
    ? // Covering in the app provides a positive amount to cover so we invert it here
      -amount
    : await getSheetValue(sheetName, 'to-budget');

  if (amountToCover >= 0 || categoryLeftover <= 0) {
    return;
  }

  // Don't exceed the available balance of the covering category.
  const coverableAmount = Math.min(Math.abs(amountToCover), categoryLeftover);

  batchMessages(() => {
    setBudget({
      category,
      month,
      amount: categoryBudget - coverableAmount,
    });
  });
}

export async function transferCategory({
  month,
  amount,
  from,
  to,
}: {
  month: string;
  amount: number;
  to: CategoryEntity['id'] | 'to-budget';
  from: CategoryEntity['id'] | 'to-budget';
}): Promise<void> {
  const sheetName = monthUtils.sheetForMonth(month);
  const fromBudgeted = await getSheetValue(sheetName, 'budget-' + from);
  // If we are simply moving it back into available cash to budget,
  // don't do anything else
  const toBudgeted =
    to !== 'to-budget' ? await getSheetValue(sheetName, 'budget-' + to) : null;

  batchMessages(() => {
    setBudget({ category: from, month, amount: fromBudgeted - amount });
    if (to !== 'to-budget') {
      setBudget({ category: to, month, amount: toBudgeted + amount });
    }
  });
}

export async function setCategoryCarryover({
  startMonth,
  category,
  flag,
}: {
  startMonth: string;
  category: string;
  flag: boolean;
}): Promise<void> {
  const months = getAllMonths(startMonth);

  batchMessages(() => {
    for (const month of months) {
      setCarryover(category, dbMonth(month).toString(), flag);
    }
  });
}

export async function resetIncomeCarryover({
  month,
}: {
  month: string;
}): Promise<void> {
  const categories = db.all<db.DbViewCategory>(
    'SELECT * FROM v_categories WHERE is_income = 1 AND tombstone = 0',
  );

  batchMessages(() => {
    for (const category of categories) {
      setCarryover(category.id, dbMonth(month).toString(), false);
    }
  });
}
